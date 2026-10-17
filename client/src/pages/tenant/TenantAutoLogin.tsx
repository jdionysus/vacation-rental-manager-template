import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Home } from "lucide-react";

export default function TenantAutoLogin() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") ?? "";
  const verifyCode = trpc.tenant.verifyCode.useMutation();

  useEffect(() => {
    if (!code) { navigate("/tenant"); return; }
    verifyCode.mutateAsync({ code }).then(result => {
      if (result.valid) {
        sessionStorage.setItem("tenant_session", JSON.stringify({
          code,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        }));
        window.location.href = "/tenant/portal";
      } else {
        navigate("/tenant");
      }
    }).catch(() => navigate("/tenant"));
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
          <Home className="w-8 h-8 text-white" />
        </div>
        <p className="text-white/70 text-sm">Accessing tenant portal...</p>
      </div>
    </div>
  );
}
