import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getGuestSessionName } from "@shared/reservation-display";
import { ArrowLeft, BookOpen, ChevronRight, Home, Lock, MessageSquare, Send } from "lucide-react";

function getSession() {
  try {
    const raw = sessionStorage.getItem("guest_session");
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      sessionStorage.removeItem("guest_session");
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function GuestFeedbackWidget({ session }: { session: any }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "general" as "general" | "issue" | "suggestion" | "compliment", message: "" });
  const [sent, setSent] = useState(false);
  const submit = trpc.feedback.submit.useMutation({
    onSuccess: () => {
      setSent(true);
      setForm({ category: "general", message: "" });
      window.setTimeout(() => { setSent(false); setOpen(false); }, 2500);
    },
  });
  const name = getGuestSessionName(session);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-sm">Share Feedback</p>
          <p className="text-xs text-muted-foreground mt-0.5">Private — only seen by your host</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen((value) => !value)}>
          <MessageSquare className="w-3.5 h-3.5" />
          {open ? "Close" : "Send Feedback"}
        </Button>
      </div>
      {open && !sent && (
        <div className="space-y-3 pt-1 border-t border-border">
          <div className="flex gap-2 flex-wrap">
            {(["general", "compliment", "suggestion", "issue"] as const).map((category) => (
              <button
                key={category}
                onClick={() => setForm((current) => ({ ...current, category }))}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors capitalize ${
                  form.category === category ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
          <textarea
            value={form.message}
            onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
            placeholder="How is your stay? Any requests, suggestions, or issues?"
            className="w-full text-sm border border-border rounded-xl p-3 resize-none bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            rows={3}
            maxLength={2000}
          />
          <Button
            className="w-full gap-2"
            size="sm"
            onClick={() => submit.mutate({ guestName: name || undefined, category: form.category, message: form.message })}
            disabled={form.message.trim().length < 3 || submit.isPending}
          >
            <Send className="w-3 h-3" />
            {submit.isPending ? "Sending..." : "Send to Host"}
          </Button>
        </div>
      )}
      {sent && <p className="pt-1 border-t border-border text-center text-sm text-emerald-600 font-medium">Thanks! Your feedback has been sent.</p>}
    </section>
  );
}

export default function GuestPortal() {
  const [, navigate] = useLocation();
  const session = getSession();
  const guestName = getGuestSessionName(session);
  const { data: pages, isLoading } = trpc.guest.pages.useQuery();
  const { data: property } = trpc.property.get.useQuery();

  useEffect(() => {
    if (!session) navigate("/guest");
  }, [navigate, session]);

  if (!session) return null;

  const seen = new Set<string>();
  const visiblePages = (pages ?? [])
    .filter((page) => page.isVisible)
    .filter((page) => {
      if (seen.has(page.slug)) return false;
      seen.add(page.slug);
      return true;
    })
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const propertyName = property?.name ?? "Your Stay";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Home className="w-5 h-5 text-primary" />
            <span className="font-serif text-lg">{propertyName}</span>
          </div>
          {session.code && (
            <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-lg px-2.5 py-1">
              <Lock className="w-3 h-3 text-primary" />
              <span className="font-mono font-bold text-sm text-primary tracking-widest">{session.code}</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <section className="animate-fade-up rounded-2xl bg-primary/5 border border-primary/10 p-5">
          <h1 className="font-serif text-3xl mb-3">{guestName ? `Welcome, ${guestName}` : `Welcome to ${propertyName}`}</h1>
          <p className="text-base text-muted-foreground leading-relaxed">We are glad you are here. Use this guide for stay details, local recommendations, and ways to contact your host.</p>
        </section>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-[62px] rounded-xl" />)}
          </div>
        ) : visiblePages.length > 0 ? (
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visiblePages.map((page) => (
              <Link key={page.id} href={`/guest/portal/${page.slug}`} className="group flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all duration-200">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  <BookOpen className="w-5 h-5" />
                </div>
                <p className="font-medium text-sm flex-1">{page.title}</p>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </Link>
            ))}
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">Your host has not added guest-guide pages yet.</section>
        )}

        <GuestFeedbackWidget session={session} />

        <section className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-sm">Guestbook</p>
            <p className="text-xs text-muted-foreground mt-0.5">Leave a note for future guests</p>
          </div>
          <Link href="/guest/guestbook"><Button variant="outline" size="sm" className="gap-1.5 shrink-0"><BookOpen className="w-3.5 h-3.5" />Sign the Guestbook</Button></Link>
        </section>

        <footer className="pt-4 border-t border-border space-y-3 text-center">
          <a href="/api/house-manual/pdf" download="house-manual.pdf" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5">
            <BookOpen className="w-3 h-3" />Download House Manual (PDF)
          </a>
          <button onClick={() => { sessionStorage.removeItem("guest_session"); navigate("/guest"); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 mx-auto">
            <ArrowLeft className="w-3 h-3" />Exit portal
          </button>
        </footer>
      </main>
    </div>
  );
}
