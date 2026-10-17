import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, KeyRound, CheckCircle2, XCircle } from "lucide-react";

// This page is used for a staff-issued guest link containing a server-validated code.
// It verifies the code server-side, sets the session, and redirects to the portal.

export default function GuestAutoLogin() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const code = params.get("code") ?? "";

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  const verifyCode = trpc.guest.verifyCode.useMutation();
  const verifyBypass = trpc.bypassCodes.verify.useQuery(
    { code: code.toUpperCase() },
    { enabled: false }
  );

  useEffect(() => {
    if (!code) {
      setStatus("error");
      setMessage("No access code provided. Please scan the QR code again.");
      return;
    }

    // Check bypass codes first
    verifyBypass.refetch().then(bypass => {
      if (bypass.data?.valid && (bypass.data.portalType === 'guest' || bypass.data.portalType === 'all')) {
        sessionStorage.setItem("guest_session", JSON.stringify({
          code: code.toUpperCase(),
          bypass: true,
          guestName: bypass.data.label ?? null,
          guestFirstNames: bypass.data.label ?? null,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        }));
        setStatus("success");
        setMessage("Welcome! Opening your stay guide...");
        setTimeout(() => navigate("/guest/portal"), 1200);
        return;
      }
      // Fall through to reservation code
      verifyCode.mutate(
        { code: code.toUpperCase() },
        {
          onSuccess: (result) => {
            if (result.valid) {
              sessionStorage.setItem("guest_session", JSON.stringify({
                code: code.toUpperCase(),
                reservationId: result.reservationId,
                guestName: result.guestName,
                guestFirstNames: result.guestName,
                arrivalDate: result.arrivalDate,
                departureDate: result.departureDate,
                expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
              }));
              setStatus("success");
              setMessage("Welcome! Opening your stay guide...");
              setTimeout(() => navigate("/guest/portal"), 1200);
            } else {
              setStatus("error");
              setMessage(result.reason ?? "Invalid or expired access code.");
            }
          },
          onError: () => {
            setStatus("error");
            setMessage("Something went wrong. Please try again.");
          },
        }
      );
    });
  }, [code]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="text-center space-y-5 animate-fade-up max-w-sm w-full">
        {status === "loading" && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto">
              <Loader2 className="w-8 h-8 text-primary-foreground animate-spin" />
            </div>
            <h1 className="font-serif text-2xl">Verifying your access...</h1>
            <p className="text-muted-foreground text-sm">Just a moment while we check your code.</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="font-serif text-2xl">Access Granted</h1>
            <p className="text-muted-foreground text-sm">{message}</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="font-serif text-2xl">Access Denied</h1>
            <p className="text-muted-foreground text-sm">{message}</p>
            <a href="/guest" className="text-sm text-primary underline underline-offset-2">
              Try entering your code manually
            </a>
          </>
        )}
      </div>
    </div>
  );
}
