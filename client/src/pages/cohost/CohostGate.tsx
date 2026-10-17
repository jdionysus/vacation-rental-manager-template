import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Home, Lock } from "lucide-react";
import Turnstile from "@/components/Turnstile";

export default function CohostGate() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const verifyCode = trpc.guest.verifyCode.useMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!turnstileToken) { setError("Please complete the security check."); return; }
    setLoading(true);
    try {
      const result = await verifyCode.mutateAsync({ code: code.trim() });
      if (result.valid) {
        sessionStorage.setItem("cohost_session", JSON.stringify({
          code: code.trim(),
          reservationId: result.reservationId,
          expiresAt: Date.now() + 12 * 60 * 60 * 1000,
        }));
        window.location.href = "/cohost/portal";
      } else {
        setError("Invalid access code. Please check with the host.");
        setTurnstileToken(null);
      }
    } catch {
      setError("Invalid access code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto">
            <Home className="w-6 h-6 text-white" />
          </div>
          <h1 className="font-serif text-2xl text-gray-900">Property Manager Portal</h1>
          <p className="text-sm text-gray-500">Vacation Rental Manager</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">
              <Lock className="w-3 h-3 inline mr-1" />Access Code
            </label>
            <Input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Enter access code"
              className="text-center text-lg tracking-widest"
              autoFocus
            />
          </div>
          <Turnstile onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          <Button type="submit" className="w-full" disabled={!code || loading || !turnstileToken}>
            {loading ? "Verifying..." : "Enter Portal"}
          </Button>
        </form>
      </div>
    </div>
  );
}
