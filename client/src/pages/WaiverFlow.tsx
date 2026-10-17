import { useState, useEffect, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ChevronRight, ChevronLeft, CheckCircle2, FileText,
  AlertTriangle, Loader2, Lock
} from "lucide-react";

// Full-screen step-through waiver flow
// URL: /waivers?booking=<base64-encoded-booking-data>
// After all waivers accepted, redirects to Stripe checkout

function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, "<h3 class='text-base font-semibold mt-5 mb-2'>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 class='text-lg font-semibold mt-6 mb-2 text-gray-900'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 class='text-xl font-bold mt-4 mb-3 text-gray-900'>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^---$/gm, "<hr class='my-4 border-gray-200' />")
    .replace(/^\| (.+) \|$/gm, (match) => {
      const cells = match.split("|").filter(c => c.trim() && c.trim() !== "---");
      return `<tr>${cells.map(c => `<td class='border border-gray-200 px-3 py-2 text-sm'>${c.trim()}</td>`).join("")}</tr>`;
    })
    .replace(/(<tr>.*<\/tr>\n?)+/g, (match) => `<table class='w-full border-collapse my-4'>${match}</table>`)
    .replace(/^- (.+)$/gm, "<li class='ml-4 list-disc'>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li class='ml-4 list-decimal'>$2</li>")
    .replace(/(<li.*<\/li>\n?)+/g, (match) => `<ul class='my-3 space-y-1'>${match}</ul>`)
    .replace(/\n\n/g, "</p><p class='mb-3'>")
    .replace(/^(?!<[htulp])/gm, "<p class='mb-3'>")
    .replace(/<p class='mb-3'><\/p>/g, "");
}

export default function WaiverFlow() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const bookingDataEncoded = params.get("booking") ?? "";

  const { data: termsPages = [], isLoading } = trpc.terms.list.useQuery();
  const createCheckout = trpc.booking.createCheckout.useMutation();

  const [currentStep, setCurrentStep] = useState(0);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Decode booking data
  let bookingData: Record<string, unknown> = {};
  try {
    bookingData = JSON.parse(atob(bookingDataEncoded));
  } catch {
    // invalid data
  }

  const requiredTerms = termsPages.filter(t => t.isRequired);
  const currentTerm = requiredTerms[currentStep];
  const isLastStep = currentStep === requiredTerms.length - 1;
  const currentAccepted = currentTerm ? accepted.has(currentTerm.id) : false;
  const allAccepted = requiredTerms.every(t => accepted.has(t.id));

  // Reset scroll detection when step changes
  useEffect(() => {
    setHasScrolledToBottom(false);
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [currentStep]);

  function handleScroll() {
    const el = contentRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 50;
    if (atBottom) setHasScrolledToBottom(true);
  }

  function acceptCurrent() {
    if (!currentTerm) return;
    setAccepted(prev => new Set(Array.from(prev).concat([currentTerm.id])));
  }

  async function handleFinish() {
    if (!allAccepted) { toast.error("Please accept all agreements."); return; }
    if (!bookingData.guestName) { toast.error("Booking data missing. Please start over."); navigate("/"); return; }
    setIsSubmitting(true);
    try {
      const result = await createCheckout.mutateAsync({
        guestName: bookingData.guestName as string,
        guestEmail: bookingData.guestEmail as string,
        guestPhone: bookingData.guestPhone as string | undefined,
        arrivalDate: bookingData.arrivalDate as string,
        departureDate: bookingData.departureDate as string,
        guestCount: bookingData.guestCount as number,
        message: bookingData.message as string | undefined,
        termsAccepted: true,
        damageChargeConsent: true,
      });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        toast.error("Could not create checkout session. Please try again.");
        setIsSubmitting(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Booking failed. Please try again.";
      toast.error(msg);
      setIsSubmitting(false);
    }
  }

  if (!bookingDataEncoded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <h1 className="font-serif text-2xl">Invalid Session</h1>
          <p className="text-gray-500 text-sm">No booking data found. Please start your booking again.</p>
          <Button onClick={() => navigate("/")} variant="outline">Back to Listing</Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!currentTerm) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h1 className="font-serif text-2xl">All Agreements Accepted</h1>
          <Button onClick={handleFinish} disabled={isSubmitting} className="bg-[#FF385C] hover:bg-[#e0314f] text-white gap-2">
            {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : <><Lock className="w-4 h-4" /> Proceed to Payment</>}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-gray-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Agreement {currentStep + 1} of {requiredTerms.length}</p>
              <p className="font-medium text-sm text-gray-900 leading-tight">{currentTerm.title}</p>
            </div>
          </div>
          {/* Progress dots */}
          <div className="flex items-center gap-1.5 shrink-0">
            {requiredTerms.map((t, i) => (
              <div
                key={t.id}
                className={`w-2 h-2 rounded-full transition-all ${
                  accepted.has(t.id) ? "bg-emerald-500" :
                  i === currentStep ? "bg-[#FF385C]" :
                  "bg-gray-200"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="max-w-3xl mx-auto">
          <div
            className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 prose-rental text-sm text-gray-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(currentTerm.content ?? "") }}
          />

          {/* Scroll hint */}
          {!hasScrolledToBottom && (
            <div className="text-center mt-4 text-xs text-gray-400 animate-bounce">
              ↓ Scroll to read the full agreement
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 px-4 py-4 sticky bottom-0">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Accept checkbox */}
          {!currentAccepted ? (
            <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              hasScrolledToBottom ? "border-gray-300 hover:border-[#FF385C] bg-white" : "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
            }`}>
              <input
                type="checkbox"
                checked={false}
                disabled={!hasScrolledToBottom}
                onChange={() => { if (hasScrolledToBottom) acceptCurrent(); }}
                className="mt-0.5 w-4 h-4 accent-[#FF385C]"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">I have read and agree to the {currentTerm.title}</p>
                {!hasScrolledToBottom && (
                  <p className="text-xs text-gray-400 mt-0.5">Please scroll to the bottom to accept</p>
                )}
              </div>
            </label>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-emerald-400 bg-emerald-50">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-sm font-medium text-emerald-800">Agreed: {currentTerm.title}</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3">
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={() => setCurrentStep(s => s - 1)}
                className="gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
            )}

            {currentAccepted && !isLastStep && (
              <Button
                className="flex-1 bg-[#FF385C] hover:bg-[#e0314f] text-white gap-1.5"
                onClick={() => setCurrentStep(s => s + 1)}
              >
                Next Agreement
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}

            {currentAccepted && isLastStep && (
              <Button
                className="flex-1 bg-[#FF385C] hover:bg-[#e0314f] text-white gap-1.5"
                onClick={handleFinish}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Preparing checkout...</>
                ) : (
                  <><Lock className="w-4 h-4" /> Proceed to Secure Payment</>
                )}
              </Button>
            )}
          </div>

          <p className="text-xs text-center text-gray-400">
            {requiredTerms.filter(t => accepted.has(t.id)).length} of {requiredTerms.length} agreements accepted
          </p>
        </div>
      </div>
    </div>
  );
}
