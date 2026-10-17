import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ExternalLink, Rss } from "lucide-react";
import { useState } from "react";

const PLATFORM_LABELS: Record<string, string> = {
  airbnb: "Airbnb",
  vrbo: "Vrbo",
  homeaway: "HomeAway",
  booking_com: "Booking.com",
  other: "Other",
};

const PLATFORM_COLORS: Record<string, string> = {
  airbnb: "bg-rose-50 text-rose-700 border-rose-200",
  vrbo: "bg-blue-50 text-blue-700 border-blue-200",
  homeaway: "bg-teal-50 text-teal-700 border-teal-200",
  booking_com: "bg-indigo-50 text-indigo-700 border-indigo-200",
  other: "bg-slate-50 text-slate-600 border-slate-200",
};

export default function OtaLinksPage() {
  const { data: links = [], refetch } = trpc.otaLinks.listAll.useQuery();
  const updateLink = trpc.otaLinks.update.useMutation({ onSuccess: () => { refetch(); toast.success("Saved"); } });

  const [editing, setEditing] = useState<Record<number, { url: string; label: string }>>({});

  function startEdit(link: typeof links[0]) {
    setEditing((prev) => ({ ...prev, [link.id]: { url: link.url, label: link.label ?? "" } }));
  }

  function saveEdit(id: number) {
    const data = editing[id];
    if (!data) return;
    updateLink.mutate({ id, url: data.url, label: data.label });
    setEditing((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }

  return (
    <HostLayout title="OTA Links">
      <div className="max-w-2xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Set the URLs for your listings on Airbnb, Vrbo, and HomeAway. These appear as booking buttons on your public listing page.
        </p>

        <div className="space-y-3">
          {links.map((link) => {
            const isEditing = !!editing[link.id];
            const editData = editing[link.id];
            return (
              <div key={link.id} className="card-premium p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Badge className={`text-xs border ${PLATFORM_COLORS[link.platform]}`}>
                    {PLATFORM_LABELS[link.platform]}
                  </Badge>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-muted-foreground">{link.isActive ? "Visible" : "Hidden"}</span>
                    <Switch
                      checked={link.isActive ?? true}
                      onCheckedChange={(v) => updateLink.mutate({ id: link.id, isActive: v })}
                    />
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Button Label</label>
                      <Input
                        value={editData.label}
                        onChange={(e) => setEditing((prev) => ({ ...prev, [link.id]: { ...prev[link.id], label: e.target.value } }))}
                        placeholder={`Book on ${PLATFORM_LABELS[link.platform]}`}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Listing URL</label>
                      <Input
                        value={editData.url}
                        onChange={(e) => setEditing((prev) => ({ ...prev, [link.id]: { ...prev[link.id], url: e.target.value } }))}
                        placeholder="https://www.airbnb.com/rooms/..."
                        className="text-sm font-mono"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(link.id)} disabled={updateLink.isPending}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing((prev) => { const next = { ...prev }; delete next[link.id]; return next; })}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{link.label || `Book on ${PLATFORM_LABELS[link.platform]}`}</p>
                      <p className="text-xs text-muted-foreground truncate font-mono">{link.url}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {link.url && (
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </a>
                      )}
                      <Button variant="outline" size="sm" onClick={() => startEdit(link)}>Edit</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </HostLayout>
  );
}
