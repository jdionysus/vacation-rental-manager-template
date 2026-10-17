import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";

export default function GuestGate() {
  const [, navigate] = useLocation();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const verifyCode = trpc.guest.verifyCode.useMutation();
  const verifyBypass = trpc.bypassCodes.verify.useQuery(
    { code: code.toUpperCase().trim() },
    { enabled: false }
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) { toast.error("Please enter your access code."); return; }
    setLoading(true);
    try {
      // Check bypass codes first (permanent codes for guests, cleaners, inspectors)
      const bypass = await verifyBypass.refetch();
      if (bypass.data?.valid && (bypass.data.portalType === 'guest' || bypass.data.portalType === 'all')) {
        sessionStorage.setItem("guest_session", JSON.stringify({
          code: code.trim().toUpperCase(),
          bypass: true,
          guestName: bypass.data.label ?? null,
          guestFirstNames: bypass.data.label ?? null,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
        }));
        toast.success("Welcome! Loading your stay information...");
        navigate("/guest/portal");
        return;
      }
      // Fall through to reservation code check
      const result = await verifyCode.mutateAsync({ code: code.trim() });
      if (result.valid) {
        sessionStorage.setItem("guest_session", JSON.stringify({
          code: code.trim(),
          reservationId: result.reservationId,
          guestName: result.guestName,
          guestFirstNames: result.guestName,
          arrivalDate: result.arrivalDate,
          departureDate: result.departureDate,
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        }));
        toast.success("Welcome! Loading your stay information...");
        navigate("/guest/portal");
      } else {
        toast.error(result.reason ?? "Invalid access code.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8 animate-fade-up">
        {/* Logo / Brand */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto shadow-lg">
            <KeyRound className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="font-serif text-3xl">Guest Portal</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Enter the guest access code from your welcome message to access your stay guide.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="card-premium p-6 space-y-5">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
                Access Code
              </label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                placeholder="e.g. 1234 or ABC12345"
                className="text-center text-2xl font-mono tracking-widest h-12"
                maxLength={10}
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-medium"
              disabled={loading || verifyCode.isPending}
            >
              {loading || verifyCode.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</>
              ) : (
                <><ShieldCheck className="w-4 h-4 mr-2" /> Access My Stay</>
              )}
            </Button>
          </div>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Your access code was sent with your welcome message.{" "}
          <a href="/" className="underline underline-offset-2 hover:text-foreground">Back to listing</a>
        </p>
      </div>
    </div>
  );
}
