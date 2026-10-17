import { CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function BookingConfirmation() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6 animate-fade-up">
        <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <div>
          <h1 className="font-serif text-3xl mb-3">Request Received</h1>
          <p className="text-muted-foreground leading-relaxed">
            Thank you for your booking request. We'll review your dates and get back to you within 24 hours to confirm availability and next steps.
          </p>
        </div>
        <div className="p-5 rounded-xl bg-secondary/50 border border-border text-sm text-left space-y-2">
          <p className="font-medium">What happens next?</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">1.</span> We review your request and check availability</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">2.</span> You'll receive a confirmation email with details</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">3.</span> Your guest portal access code will be sent before check-in</li>
          </ul>
        </div>
        <Button variant="outline" onClick={() => navigate("/")} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to listing
        </Button>
      </div>
    </div>
  );
}
