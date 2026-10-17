import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, ClipboardCheck, KeyRound } from "lucide-react";
import Turnstile from "@/components/Turnstile";

export default function InspectorGate() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const verifyCode = trpc.guest.verifyCode.useMutation();
  const verifyBypass = trpc.bypassCodes.verify.useQuery(
    { code: code.toUpperCase().trim() },
    { enabled: false }
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    if (!turnstileToken) { toast.error("Please complete the security check."); return; }
    setLoading(true);
    // Check bypass codes first
    const bypass = await verifyBypass.refetch();
    if (bypass.data?.valid && (bypass.data.portalType === 'inspector' || bypass.data.portalType === 'all')) {
      sessionStorage.setItem("inspector_session", JSON.stringify({
        code: code.toUpperCase().trim(),
        bypass: true,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }));
      window.location.href = "/inspector/portal";
      return;
    }
    verifyCode.mutate(
      { code: code.toUpperCase().trim() },
      {
        onSuccess: (result) => {
          setLoading(false);
          if (result.valid) {
            sessionStorage.setItem("inspector_session", JSON.stringify({
              code: code.toUpperCase().trim(),
              reservationId: result.reservationId,
              expiresAt: Date.now() + 12 * 60 * 60 * 1000,
            }));
            window.location.href = "/inspector/portal";
          } else {
            toast.error(result.reason ?? "Invalid code. Please try again.");
            setTurnstileToken(null);
          }
        },
        onError: () => {
          setLoading(false);
          toast.error("Something went wrong. Please try again.");
        },
      }
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8 animate-fade-up">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-sky-600 flex items-center justify-center mx-auto shadow-lg">
            <ClipboardCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-serif text-3xl">Inspection Portal</h1>
          <p className="text-muted-foreground text-sm">Vacation Rental Manager</p>
        </div>

        <form onSubmit={handleSubmit} className="card-premium p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
              Access Code
            </label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Enter your code"
              className="text-center text-xl font-mono tracking-widest h-14"
              maxLength={12}
              autoFocus
              autoComplete="off"
            />
          </div>
          <Turnstile onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />
          <Button
            type="submit"
            className="w-full h-12 font-medium gap-2 bg-sky-600 hover:bg-sky-700"
            disabled={!code.trim() || loading || !turnstileToken}
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</> : <><KeyRound className="w-4 h-4" /> Enter Portal</>}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Your access code is provided by the property manager.
        </p>
      </div>
    </div>
  );
}
