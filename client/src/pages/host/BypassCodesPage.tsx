import { useState } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Copy, Link, Clock, Hash } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const PORTAL_LABELS: Record<string, string> = {
  guest: "Guest Portal",
  cleaner: "Cleaner Portal",
  inspector: "Inspector Portal",
  all: "All Portals",
};

const PORTAL_STYLES: Record<string, string> = {
  guest: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cleaner: "bg-amber-50 text-amber-700 border-amber-200",
  inspector: "bg-sky-50 text-sky-700 border-sky-200",
  all: "bg-purple-50 text-purple-700 border-purple-200",
};

const PORTAL_PATHS: Record<string, string> = {
  guest: "/guest/auto",
  cleaner: "/cleaner/portal",
  inspector: "/inspector/portal",
  all: "/guest/auto",
};

function timeAgo(dateVal: unknown): string {
  if (!dateVal) return "";
  const d = dateVal instanceof Date ? dateVal : new Date(String(dateVal));
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function BypassCodesPage() {
  const { data: codes = [], refetch, isLoading } = trpc.bypassCodes.list.useQuery();
  const createCode = trpc.bypassCodes.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm({ code: "", label: "", portalType: "guest" }); toast.success("Bypass code created"); },
    onError: (e) => toast.error(e.message ?? "Failed to create code"),
  });
  const deleteCode = trpc.bypassCodes.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Code deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: "", label: "", portalType: "guest" as "guest" | "cleaner" | "inspector" | "all" });

  function generateCode() {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setForm(f => ({ ...f, code }));
  }

  function getPortalUrl(code: string, portalType: string): string {
    const base = typeof window !== "undefined" ? window.location.origin : "https://example.com";
    const path = PORTAL_PATHS[portalType] ?? "/guest/auto";
    return `${base}${path}?code=${code}`;
  }

  function copyLink(code: string, portalType: string) {
    const url = getPortalUrl(code, portalType);
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Link copied to clipboard!");
    }).catch(() => {
      toast.error("Could not copy — try manually: " + url);
    });
  }

  function copyText(code: string, portalType: string, label?: string | null) {
    const url = getPortalUrl(code, portalType);
    const name = label ? `Hi! Here's your access link for the ${label} portal` : `Hi! Here's your access link for the ${PORTAL_LABELS[portalType]}`;
    const text = `${name} at Vacation Rental Manager:\n\n${url}\n\nOr enter code: ${code}`;
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Text message copied!");
    }).catch(() => {
      toast.error("Could not copy");
    });
  }

  return (
    <HostLayout title="Bypass Codes">
      <div className="max-w-2xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground max-w-md">
              Permanent 4-digit codes that bypass the reservation gate and go straight to a portal. 
              Use for cleaners, inspectors, or anyone who needs recurring access.
            </p>
          </div>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5" />
            Add Code
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-secondary animate-pulse" />)}</div>
        ) : codes.length === 0 ? (
          <div className="card-premium p-10 text-center text-muted-foreground space-y-3">
            <Hash className="w-8 h-8 mx-auto opacity-30" />
            <p>No bypass codes yet.</p>
            <p className="text-xs">Create codes for cleaners, inspectors, or recurring guests.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {codes.map(c => (
              <div key={c.id} className="card-premium p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xl font-bold tracking-widest text-foreground">{c.code}</span>
                      <Badge className={`text-[10px] px-2 py-0.5 border ${PORTAL_STYLES[c.portalType] ?? ""}`}>
                        {PORTAL_LABELS[c.portalType] ?? c.portalType}
                      </Badge>
                      {c.label && <span className="text-sm text-muted-foreground">{c.label}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Added {timeAgo(c.createdAt)}
                      </span>
                      {(c.useCount ?? 0) > 0 && (
                        <span>Used {c.useCount} time{(c.useCount ?? 0) !== 1 ? "s" : ""}</span>
                      )}
                      {c.lastUsedAt && (
                        <span>Last used {timeAgo(c.lastUsedAt)}</span>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                    onClick={() => deleteCode.mutate({ id: c.id })}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
                    onClick={() => copyLink(c.code, c.portalType)}>
                    <Link className="w-3 h-3" />
                    Copy Link
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
                    onClick={() => copyText(c.code, c.portalType, c.label)}>
                    <Copy className="w-3 h-3" />
                    Copy Text Message
                  </Button>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground truncate mt-1">
                      {getPortalUrl(c.code, c.portalType)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Code Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Add Bypass Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">4-Digit Code</label>
              <div className="flex gap-2">
                <Input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                  placeholder="e.g. 1234"
                  className="font-mono text-xl tracking-widest text-center"
                  maxLength={10}
                />
                <Button variant="outline" onClick={generateCode} className="shrink-0">Generate</Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">4-10 digits. Must be unique.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Label (optional)</label>
              <Input
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Host, Cleaning Crew, Host"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Portal Access</label>
              <Select value={form.portalType} onValueChange={v => setForm(f => ({ ...f, portalType: v as typeof form.portalType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="guest">Guest Portal</SelectItem>
                  <SelectItem value="cleaner">Cleaner Portal</SelectItem>
                  <SelectItem value="inspector">Inspector Portal</SelectItem>
                  <SelectItem value="all">All Portals (guest)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              disabled={form.code.length < 4 || createCode.isPending}
              onClick={() => createCode.mutate(form)}>
              {createCode.isPending ? "Creating..." : "Create Code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HostLayout>
  );
}
