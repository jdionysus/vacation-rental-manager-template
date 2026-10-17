import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Bath,
  Bed,
  Car,
  CheckCircle2,
  Clock,
  Coffee,
  MapPin,
  Shield,
  Tv,
  Users,
  Utensils,
  Wifi,
  Wind,
  X,
} from "lucide-react";
import BookingCard from "@/components/BookingCard";

const PLATFORM_COLORS: Record<string, string> = {
  airbnb: "bg-[#FF5A5F] hover:bg-[#e04e53] text-white",
  vrbo: "bg-[#3D6ECC] hover:bg-[#3360b8] text-white",
  homeaway: "bg-[#FF6B35] hover:bg-[#e85f2a] text-white",
  booking_com: "bg-[#003580] hover:bg-[#002a66] text-white",
  other: "bg-gray-700 hover:bg-gray-800 text-white",
};

function amount(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  if (/\b(?:AM|PM)\b/i.test(value)) return value;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minute} ${suffix}`;
}

function amenityIcon(label: string) {
  const value = label.toLowerCase();
  if (/wifi|internet/.test(value)) return <Wifi className="w-5 h-5" />;
  if (/parking|driveway|garage/.test(value)) return <Car className="w-5 h-5" />;
  if (/coffee|beverage|snack/.test(value)) return <Coffee className="w-5 h-5" />;
  if (/cool|heat|air.?condition/.test(value)) return <Wind className="w-5 h-5" />;
  if (/tv|television|stream/.test(value)) return <Tv className="w-5 h-5" />;
  if (/kitchen|cook/.test(value)) return <Utensils className="w-5 h-5" />;
  return <CheckCircle2 className="w-5 h-5" />;
}

function setMeta(attribute: "name" | "property", key: string, content: string) {
  if (!content) return;
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

type BookingStep = "dates" | "details";

export default function Landing() {
  const bookingRef = useRef<HTMLDivElement>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [showDirectBooking, setShowDirectBooking] = useState(false);
  const [step, setStep] = useState<BookingStep>("dates");
  const [availabilityResult, setAvailabilityResult] = useState({ available: false, checked: false });
  const [form, setForm] = useState({
    arrivalDate: "",
    departureDate: "",
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    guestCount: 1,
    message: "",
  });

  const { data: property, isLoading: propertyLoading } = trpc.property.get.useQuery();
  const { data: calendarEvents } = trpc.calendar.events.useQuery();
  const { data: dbOtaLinks = [] } = trpc.otaLinks.list.useQuery();
  const { data: allDailyRates = [] } = trpc.dailyRates.list.useQuery({});
  const createCheckout = trpc.booking.createCheckout.useMutation();
  const checkAvail = trpc.booking.checkAvailability.useQuery(
    { arrivalDate: form.arrivalDate, departureDate: form.departureDate },
    { enabled: !!(form.arrivalDate && form.departureDate && form.arrivalDate < form.departureDate) },
  );

  const photos = property?.photos ?? [];
  const amenities = property?.amenities ?? [];
  const nightlyRate = amount(property?.nightlyRate);
  const cleaningFee = amount(property?.cleaningFee);
  const descriptionParagraphs = (property?.description ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const otaLinks = dbOtaLinks
    .filter((link) => link.isActive && link.url)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((link) => ({
      label: link.label ?? link.platform,
      url: link.url,
      color: PLATFORM_COLORS[link.platform] ?? PLATFORM_COLORS.other,
    }));

  const rateMap = useMemo(() => new Map(allDailyRates.map((rate) => [
    rate.date,
    rate.overrideRate
      ? amount(rate.overrideRate)
      : rate.competitorRate
        ? Math.round(amount(rate.competitorRate) * amount(rate.multiplier))
        : null,
  ])), [allDailyRates]);

  const computedPrice = useMemo(() => {
    if (!form.arrivalDate || !form.departureDate || form.arrivalDate >= form.departureDate) return null;
    const arrival = new Date(`${form.arrivalDate}T12:00:00Z`);
    const departure = new Date(`${form.departureDate}T12:00:00Z`);
    const nightCount = Math.round((departure.getTime() - arrival.getTime()) / 86400000);
    if (nightCount <= 0) return null;

    let subtotal = 0;
    for (let index = 0; index < nightCount; index++) {
      const date = new Date(arrival.getTime() + index * 86400000).toISOString().split("T")[0];
      subtotal += rateMap.get(date) ?? nightlyRate;
    }
    return {
      nights: nightCount,
      subtotal,
      cleaningFee,
      total: subtotal + cleaningFee,
      avgNightlyRate: Math.round(subtotal / nightCount),
    };
  }, [cleaningFee, form.arrivalDate, form.departureDate, nightlyRate, rateMap]);

  useEffect(() => {
    if (checkAvail.data !== undefined) {
      setAvailabilityResult({ available: checkAvail.data.available, checked: true });
    }
  }, [checkAvail.data]);

  useEffect(() => {
    if (!property) return;
    const title = property.seoTitle || property.name;
    const description = property.seoDescription || property.description || property.tagline || "";
    const image = photos[0] ? new URL(photos[0], window.location.origin).href : "";

    document.title = title;
    setMeta("name", "description", description);
    setMeta("name", "keywords", property.seoKeywords || "");
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", window.location.href);
    setMeta("property", "og:image", image);
    setMeta("property", "og:site_name", property.name);
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", image);

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "VacationRental",
      name: property.name,
      url: window.location.origin,
      image: image || undefined,
      description,
      address: property.address || property.city ? {
        "@type": "PostalAddress",
        streetAddress: property.address || undefined,
        addressLocality: property.city || undefined,
      } : undefined,
      numberOfBedrooms: property.bedrooms || undefined,
      numberOfBathroomsTotal: property.bathrooms || undefined,
      occupancy: property.maxGuests ? { "@type": "QuantitativeValue", maxValue: property.maxGuests } : undefined,
      checkinTime: property.checkInTime || undefined,
      checkoutTime: property.checkOutTime || undefined,
    };
    let script = document.head.querySelector<HTMLScriptElement>("script[data-property-listing-schema]");
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.propertyListingSchema = "true";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(structuredData);
  }, [photos, property]);

  async function handleCheckout() {
    try {
      const result = await createCheckout.mutateAsync({
        ...form,
        termsAccepted: true,
        damageChargeConsent: true,
      });
      if (result.checkoutUrl) window.location.href = result.checkoutUrl;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Booking failed. Please try again.");
    }
  }

  if (propertyLoading) {
    return <div className="min-h-screen bg-white flex items-center justify-center text-sm text-gray-500">Loading listing…</div>;
  }

  if (!property) {
    return <div className="min-h-screen bg-white flex items-center justify-center text-sm text-gray-500">Listing unavailable.</div>;
  }

  return (
    <div className="min-h-screen bg-white">
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <span className="font-serif text-xl text-gray-900">{property.name}</span>
          <a href="/guest" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">Guest Portal</a>
        </div>
      </nav>

      {photos.length > 0 && (
        <div className="pt-4 sm:pt-6">
          <div className="sm:hidden">
            <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory scrollbar-hide px-4" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
              {photos.map((photo, index) => (
                <div key={photo} className="flex-none w-[80vw] h-[56vw] snap-start rounded-xl overflow-hidden cursor-pointer" onClick={() => { setActivePhoto(index); setShowAllPhotos(true); }}>
                  <img src={photo} alt={`${property.name} photo ${index + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
            <button onClick={() => setShowAllPhotos(true)} className="mx-4 mt-2 text-xs text-gray-500 underline">View all {photos.length} photos</button>
          </div>

          <div className="hidden sm:block max-w-7xl mx-auto px-4 sm:px-6">
            <div className="relative grid grid-cols-4 grid-rows-2 gap-2 h-[480px] rounded-2xl overflow-hidden">
              <div className="col-span-2 row-span-2 cursor-pointer" onClick={() => setShowAllPhotos(true)}>
                <img src={photos[0]} alt={`${property.name} main photo`} className="w-full h-full object-cover hover:brightness-95 transition-all" />
              </div>
              {photos.slice(1, 5).map((photo, index) => (
                <div key={photo} className="cursor-pointer" onClick={() => { setActivePhoto(index + 1); setShowAllPhotos(true); }}>
                  <img src={photo} alt={`${property.name} photo ${index + 2}`} className="w-full h-full object-cover hover:brightness-95 transition-all" />
                </div>
              ))}
              <button onClick={() => setShowAllPhotos(true)} className="absolute bottom-4 right-4 bg-white text-gray-900 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 shadow-sm">Show all photos</button>
            </div>
          </div>
        </div>
      )}

      {showAllPhotos && photos.length > 0 && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 flex items-center justify-between px-4 h-14">
            <button onClick={() => setShowAllPhotos(false)} className="flex items-center gap-2 text-gray-700 hover:text-gray-900"><X className="w-5 h-5" /><span className="text-sm font-medium">Close</span></button>
            <span className="text-sm text-gray-500">{photos.length} photos</span>
          </div>
          <div className="max-w-3xl mx-auto px-0 sm:px-4 py-0 sm:py-4 space-y-1 sm:space-y-2">
            {photos.map((photo, index) => <img key={photo} src={photo} alt={`${property.name} photo ${index + 1}`} className="w-full max-h-[70vh] object-cover sm:rounded-xl" />)}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-8">
            <div>
              <h1 className="font-serif text-3xl text-gray-900 mb-2">{property.name}</h1>
              {property.tagline && <p className="text-gray-600">{property.tagline}</p>}
              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-600">
                {property.city && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{property.city}</span>}
                {property.maxGuests && <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />Up to {property.maxGuests} guests</span>}
                {property.bedrooms && <span className="flex items-center gap-1"><Bed className="w-3.5 h-3.5" />{property.bedrooms} bedroom{property.bedrooms === 1 ? "" : "s"}</span>}
                {property.bathrooms && <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" />{property.bathrooms} bath{property.bathrooms === 1 ? "" : "s"}</span>}
                {property.checkInTime && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Check-in {formatTime(property.checkInTime)}</span>}
              </div>
            </div>

            {descriptionParagraphs.length > 0 && <><hr className="border-gray-200" /><div className="space-y-5 text-gray-700 leading-relaxed">{descriptionParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></>}

            {amenities.length > 0 && <><hr className="border-gray-200" /><div><h2 className="font-serif text-2xl text-gray-900 mb-5">What this place offers</h2><div className="grid grid-cols-2 gap-3">{amenities.map((amenity) => <div key={amenity} className="flex items-center gap-3 py-2"><span className="text-gray-600">{amenityIcon(amenity)}</span><span className="text-gray-700">{amenity}</span></div>)}</div></div></>}

            {property.houseRules && <><hr className="border-gray-200" /><div><h2 className="font-serif text-2xl text-gray-900 mb-4">House Rules</h2><div className="flex items-start gap-3 p-4 rounded-xl bg-gray-50"><Shield className="w-5 h-5 text-gray-500 mt-0.5 shrink-0" /><p className="text-sm text-gray-700 leading-relaxed">{property.houseRules}</p></div>{property.listingNote && <p className="text-xs text-gray-400 mt-3">{property.listingNote}</p>}</div></>}

            {(property.mapImageUrl || property.mapLocationLabel || property.address) && <><hr className="border-gray-200" /><div><h2 className="font-serif text-2xl text-gray-900 mb-4">Location</h2>{property.mapImageUrl && <div className="rounded-xl overflow-hidden border border-gray-200"><img src={property.mapImageUrl} alt={`${property.name} location map`} className="w-full object-cover" /></div>}<p className="text-sm text-gray-500 mt-2 flex items-center gap-1.5"><MapPin className="w-4 h-4 shrink-0" />{property.mapLocationLabel || property.city}{property.address && <><span>&nbsp;·&nbsp;</span><a href={`https://maps.google.com/?q=${encodeURIComponent(property.address)}`} target="_blank" rel="noopener noreferrer" className="text-gray-700 hover:text-gray-900 underline transition-colors">Open in Google Maps</a></>}</p></div></>}
          </div>

          <div className="lg:col-span-1" ref={bookingRef}>
            <div className="sticky top-24">
              <BookingCard events={calendarEvents ?? []} rateMap={rateMap} otaLinks={otaLinks} nightlyRate={nightlyRate} cleaningFee={cleaningFee} maxGuests={property.maxGuests ?? 1} availabilityResult={availabilityResult} checkAvailLoading={checkAvail.isLoading} form={form} onFormChange={setForm} onCheckout={handleCheckout} checkoutPending={createCheckout.isPending} />
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-gray-200 mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500"><span className="font-serif text-base text-gray-900">{property.name}</span><div className="flex items-center gap-6"><a href="/guest" className="hover:text-gray-700 transition-colors">Guest Portal</a><a href="/host/login" className="hover:text-gray-700 transition-colors">Host Login</a></div></div>
          {(property.listingNote || property.city) && <p className="text-xs text-gray-400 text-center sm:text-left">{[property.listingNote, property.city].filter(Boolean).join(" · ")}</p>}
        </div>
      </footer>
    </div>
  );
}
