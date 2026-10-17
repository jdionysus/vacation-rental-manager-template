import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import Turnstile from "@/components/Turnstile";

export default function HostLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const login = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      toast.success(`Welcome back, ${data.name ?? "Host"}!`);
      setTimeout(() => { window.location.href = "/host"; }, 500);
    },
    onError: (err) => {
      toast.error(err.message ?? "Login failed. Check your credentials.");
      setTurnstileToken(null);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { toast.error("Please enter email and password."); return; }
    if (!turnstileToken) { toast.error("Please complete the security check."); return; }
    login.mutate({ email, password });
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8 animate-fade-up">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto shadow-lg">
            <KeyRound className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="font-serif text-3xl">Host Login</h1>
          <p className="text-muted-foreground text-sm">Sign in to manage your property.</p>
        </div>

        <form onSubmit={handleSubmit} className="card-premium p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Password</label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Turnstile onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />
          <Button
            type="submit"
            className="w-full h-11 font-medium"
            disabled={login.isPending || !turnstileToken}
          >
            {login.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in...</> : "Sign In"}
          </Button>
        </form>

        <a href="/" className="block text-center text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
          ← Back to listing
        </a>
      </div>
    </div>
  );
}
