import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, Send, MapPin } from "lucide-react";
import { getGuestSessionName } from "@shared/reservation-display";

function getSession() {
  try {
    const raw = sessionStorage.getItem("guest_session");
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() > s.expiresAt) { sessionStorage.removeItem("guest_session"); return null; }
    return s;
  } catch { return null; }
}

function formatDate(ts: string | Date) {
  try { return new Date(ts).toLocaleDateString("en-US", { month: "long", year: "numeric" }); }
  catch { return ""; }
}

export default function GuestbookPage() {
  const session = getSession();
  const { data: entries = [], refetch } = trpc.guestbook.list.useQuery();
  const submit = trpc.guestbook.submit.useMutation({
    onSuccess: () => {
      refetch();
      setForm({ guestName: "", hometown: "", message: "" });
      setSubmitted(true);
      toast.success("Your message has been added to the guestbook!");
    },
    onError: (err) => toast.error(err.message ?? "Failed to submit"),
  });

  const [form, setForm] = useState({ guestName: "", hometown: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  // Pre-fill name from session
  const defaultName = getGuestSessionName(session) ?? "";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center gap-3">
          <Link href="/guest/portal">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <span className="font-serif text-lg">Vacation Rental Guestbook</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Intro */}
        <div>
          <h1 className="font-serif text-3xl mb-2">Sign the Guestbook</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Leave a note for future guests and let us know about your stay. Your message will be shared publicly.
          </p>
        </div>

        {/* Submit form */}
        {!submitted ? (
          <div className="card-premium p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Your Name</label>
                <Input
                  value={form.guestName || defaultName}
                  onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))}
                  placeholder="e.g. Landon"
                  maxLength={128}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Hometown (optional)</label>
                <Input
                  value={form.hometown}
                  onChange={e => setForm(f => ({ ...f, hometown: e.target.value }))}
                  placeholder="e.g. Austin, TX"
                  maxLength={128}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Your Message</label>
              <textarea
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Tell us about your stay, what you loved, or a tip for future guests..."
                className="w-full text-sm border border-border rounded-xl p-3 resize-none bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                rows={4}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground text-right mt-1">{form.message.length}/1000</p>
            </div>
            <Button
              className="w-full gap-2"
              onClick={() => submit.mutate({ guestName: form.guestName || defaultName, hometown: form.hometown || undefined, message: form.message })}
              disabled={!(form.guestName || defaultName).trim() || form.message.trim().length < 3 || submit.isPending}
            >
              <Send className="w-4 h-4" />
              {submit.isPending ? "Signing..." : "Sign the Guestbook"}
            </Button>
          </div>
        ) : (
          <div className="card-premium p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <BookOpen className="w-6 h-6 text-emerald-600" />
            </div>
            <h2 className="font-serif text-xl">Thank you!</h2>
            <p className="text-sm text-muted-foreground">Your message has been added to the guestbook.</p>
            <Button variant="outline" size="sm" onClick={() => setSubmitted(false)}>Add another message</Button>
          </div>
        )}

        {/* Existing entries */}
        {entries.length > 0 && (
          <div className="space-y-4">
            <h2 className="font-serif text-xl">Previous Guests</h2>
            <div className="space-y-3">
              {entries.map((entry: any) => (
                <div key={entry.id} className="rounded-2xl border border-border bg-card p-5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{entry.guestName}</p>
                      {entry.hometown && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" />{entry.hometown}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{formatDate(entry.createdAt)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed italic">"{entry.message}"</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
