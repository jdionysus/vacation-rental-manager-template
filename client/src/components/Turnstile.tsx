import { useEffect, useRef } from "react";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

interface Props {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact";
}

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export default function Turnstile({ onVerify, onExpire, theme = "light", size = "normal" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) {
      // A fresh installation can operate before Turnstile is configured. Set the
      // environment variable before publishing a public portal.
      onVerify("turnstile-not-configured");
      return;
    }
    function renderWidget() {
      if (!containerRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: onVerify,
        "expired-callback": onExpire ?? (() => {}),
        theme,
        size,
      });
    }
    if (window.turnstile) {
      renderWidget();
    } else if (!document.getElementById("cf-turnstile-script")) {
      const script = document.createElement("script");
      script.id = "cf-turnstile-script";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
    } else {
      const interval = window.setInterval(() => {
        if (window.turnstile) { window.clearInterval(interval); renderWidget(); }
      }, 100);
      return () => window.clearInterval(interval);
    }
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* widget is already gone */ }
        widgetIdRef.current = null;
      }
    };
  }, [onExpire, onVerify, size, theme]);

  return SITE_KEY ? <div ref={containerRef} className="flex justify-center" /> : null;
}
