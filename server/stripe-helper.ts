import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { stripeCustomers, damageCharges, reservations } from "../drizzle/schema";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2026-08-26.dahlia" });
}

// Create a Stripe Setup Intent to save card on file
export async function createSetupIntent(guestEmail: string, guestName: string, reservationId: number, origin: string) {
  const stripe = getStripe();

  // Create or retrieve customer
  const customers = await stripe.customers.list({ email: guestEmail, limit: 1 });
  let customer: Stripe.Customer;
  if (customers.data.length > 0) {
    customer = customers.data[0];
  } else {
    customer = await stripe.customers.create({
      email: guestEmail,
      name: guestName,
      metadata: { reservationId: String(reservationId) },
    });
  }

  // Create setup intent
  const setupIntent = await stripe.setupIntents.create({
    customer: customer.id,
    payment_method_types: ["card"],
    usage: "off_session",
    metadata: {
      reservationId: String(reservationId),
      guestEmail,
      guestName,
    },
  });

  return {
    clientSecret: setupIntent.client_secret,
    setupIntentId: setupIntent.id,
    customerId: customer.id,
    publishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
  };
}

// Create a Checkout Session for the booking payment
export async function createBookingCheckout(params: {
  reservationId: number;
  guestEmail: string;
  guestName: string;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  nightlyRate: number;
  cleaningFee: number;
  totalAmount: number;
  origin: string;
}) {
  const stripe = getStripe();

  // Create or retrieve customer
  const customers = await stripe.customers.list({ email: params.guestEmail, limit: 1 });
  let customer: Stripe.Customer;
  if (customers.data.length > 0) {
    customer = customers.data[0];
  } else {
    customer = await stripe.customers.create({
      email: params.guestEmail,
      name: params.guestName,
      metadata: { reservationId: String(params.reservationId) },
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    payment_method_types: ["card"],
    mode: "payment",
    payment_intent_data: {
      setup_future_usage: "off_session", // Save card for future damage charges
      metadata: {
        reservationId: String(params.reservationId),
        type: "booking",
      },
    },
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Stay: ${params.arrivalDate} → ${params.departureDate}`,
            description: `${params.nights} night${params.nights > 1 ? "s" : ""} · Card will be saved for potential damage charges`,
          },
          unit_amount: Math.round(params.nightlyRate * 100),
        },
        quantity: params.nights,
      },
      ...(params.cleaningFee > 0 ? [{
        price_data: {
          currency: "usd",
          product_data: { name: "Cleaning Fee" },
          unit_amount: Math.round(params.cleaningFee * 100),
        },
        quantity: 1,
      }] : []),
    ],
    customer_email: undefined, // Already set via customer
    metadata: {
      reservationId: String(params.reservationId),
      guestEmail: params.guestEmail,
      guestName: params.guestName,
    },
    client_reference_id: String(params.reservationId),
    success_url: `${params.origin}/booking-confirmed?reservation=${params.reservationId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${params.origin}/?cancelled=true`,
    allow_promotion_codes: true,
  });

  return { url: session.url, sessionId: session.id, customerId: customer.id };
}

// Charge a saved card for damage
export async function chargeDamage(params: {
  stripeCustomerRecordId: number;
  amount: number; // in dollars
  description: string;
  chargedById: number;
}) {
  const stripe = getStripe();
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [customerRecord] = await db.select().from(stripeCustomers).where(eq(stripeCustomers.id, params.stripeCustomerRecordId)).limit(1);
  if (!customerRecord) throw new Error("Stripe customer record not found");
  if (!customerRecord.stripePaymentMethodId) throw new Error("No saved payment method on file");

  // Create damage charge record
  const [insertResult] = await db.insert(damageCharges).values({
    reservationId: customerRecord.reservationId,
    stripeCustomerId: customerRecord.id,
    amount: String(params.amount),
    description: params.description,
    status: "pending",
    chargedById: params.chargedById,
  });

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(params.amount * 100),
      currency: "usd",
      customer: customerRecord.stripeCustomerId,
      payment_method: customerRecord.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      description: params.description,
      metadata: {
        type: "damage_charge",
        reservationId: String(customerRecord.reservationId),
      },
    });

    // Update charge record
    await db.update(damageCharges).set({
      stripePaymentIntentId: paymentIntent.id,
      status: "charged",
      chargedAt: new Date(),
    }).where(eq(damageCharges.reservationId, customerRecord.reservationId));

    return { success: true, paymentIntentId: paymentIntent.id };
  } catch (err: unknown) {
    await db.update(damageCharges).set({ status: "failed" }).where(eq(damageCharges.reservationId, customerRecord.reservationId));
    throw err;
  }
}

// Handle Stripe webhooks
export async function handleStripeWebhook(rawBody: Buffer, signature: string) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET not configured");

  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

  if (event.id.startsWith("evt_test_")) {
    return { verified: true };
  }

  const db = await getDb();
  if (!db) return { received: true };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const reservationId = parseInt(session.metadata?.reservationId ?? "0");
      if (!reservationId) break;

      // Get payment method from payment intent
      if (session.payment_intent) {
        const pi = await stripe.paymentIntents.retrieve(session.payment_intent as string, {
          expand: ["payment_method"],
        });
        const pm = pi.payment_method as Stripe.PaymentMethod;

        // Save stripe customer record
        await db.insert(stripeCustomers).values({
          reservationId,
          guestEmail: session.metadata?.guestEmail ?? session.customer_details?.email ?? "",
          guestName: session.metadata?.guestName ?? session.customer_details?.name ?? "",
          stripeCustomerId: session.customer as string,
          stripePaymentMethodId: pm?.id ?? null,
          stripeSetupIntentId: null,
          cardBrand: pm?.card?.brand ?? null,
          cardLast4: pm?.card?.last4 ?? null,
          cardExpMonth: pm?.card?.exp_month ?? null,
          cardExpYear: pm?.card?.exp_year ?? null,
          termsAcceptedAt: new Date(),
          damageChargeConsent: true,
        }).onDuplicateKeyUpdate({
          set: {
            stripePaymentMethodId: pm?.id ?? null,
            cardBrand: pm?.card?.brand ?? null,
            cardLast4: pm?.card?.last4 ?? null,
          }
        });

        // Mark reservation as paid
        await db.update(reservations).set({
          status: "confirmed",
          paymentStatus: "paid",
        }).where(eq(reservations.id, reservationId));
      }
      break;
    }
    case "setup_intent.succeeded": {
      const si = event.data.object as Stripe.SetupIntent;
      const reservationId = parseInt(si.metadata?.reservationId ?? "0");
      if (!reservationId || !si.payment_method) break;

      const pm = await stripe.paymentMethods.retrieve(si.payment_method as string);
      await db.insert(stripeCustomers).values({
        reservationId,
        guestEmail: si.metadata?.guestEmail ?? "",
        guestName: si.metadata?.guestName ?? "",
        stripeCustomerId: si.customer as string,
        stripePaymentMethodId: si.payment_method as string,
        stripeSetupIntentId: si.id,
        cardBrand: pm.card?.brand ?? null,
        cardLast4: pm.card?.last4 ?? null,
        cardExpMonth: pm.card?.exp_month ?? null,
        cardExpYear: pm.card?.exp_year ?? null,
        termsAcceptedAt: new Date(),
        damageChargeConsent: true,
      }).onDuplicateKeyUpdate({
        set: { stripePaymentMethodId: si.payment_method as string }
      });
      break;
    }
  }

  return { received: true };
}
