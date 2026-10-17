import type { Express } from "express";
import express from "express";
import { handleStripeWebhook } from "./stripe-helper";

export function registerStripeWebhook(app: Express) {
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const sig = req.headers["stripe-signature"] as string;
      if (!sig) {
        res.status(400).json({ error: "Missing stripe-signature header" });
        return;
      }
      try {
        const result = await handleStripeWebhook(req.body as Buffer, sig);
        res.json(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Stripe Webhook] Error:", msg);
        res.status(400).json({ error: msg });
      }
    }
  );
}
