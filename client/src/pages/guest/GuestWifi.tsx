import { Wifi, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

// Wi-Fi captive portal landing page.
// Connecting to the Wi-Fi does not grant guest-portal access; guests continue
// through the normal server-validated access-code gate.
export default function GuestWifi() {
  const { data: property } = trpc.property.get.useQuery();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 pointer-events-none" />

      <div className="relative text-center space-y-6 max-w-sm w-full">
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: "1.5s" }} />
          <div className="absolute inset-2 rounded-full bg-primary/15 animate-ping" style={{ animationDuration: "1.5s", animationDelay: "0.3s" }} />
          <div className="relative w-24 h-24 rounded-full bg-primary flex items-center justify-center shadow-lg">
            <Wifi className="w-10 h-10 text-primary-foreground" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="font-serif text-2xl">Wi-Fi Connected</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Enter the guest access code from your welcome message to open your stay guide.
          </p>
        </div>

        <a
          href="/guest"
          className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          <ShieldCheck className="w-4 h-4" />
          Enter Access Code
        </a>
      </div>

      <div className="absolute bottom-8 text-center">
        <p className="font-serif text-lg text-muted-foreground">{property?.name ?? "Guest Portal"}</p>
        {property?.city && <p className="text-xs text-muted-foreground/60 mt-1">{property.city}</p>}
      </div>
    </div>
  );
}
