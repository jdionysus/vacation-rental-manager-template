import { useState } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Eye, EyeOff, Trash2, Edit2, Check, X, MapPin, BookOpen } from "lucide-react";

function formatDate(ts: string | Date) {
  try { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return ""; }
}

export default function GuestbookAdminPage() {
  const { data: entries = [], refetch } = trpc.guestbook.listAll.useQuery();
  const update = trpc.guestbook.update.useMutation({ onSuccess: () => { refetch(); toast.success("Updated"); setEditingId(null); } });
  const del = trpc.guestbook.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Deleted"); } });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ guestName: "", hometown: "", message: "" });

  const visible = entries.filter((e: any) => e.isVisible).length;

  return (
    <HostLayout title="Guestbook">
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">
                {entries.length} total entries · {visible} visible
              </p>
            </div>
          </div>
          <a href="/guest/guestbook" target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary hover:underline">
            View public guestbook →
          </a>
        </div>

        {entries.length === 0 ? (
          <div className="card-premium p-10 text-center text-muted-foreground">
            <BookOpen className="w-8 h-8 mx-auto opacity-30 mb-3" />
            <p>No guestbook entries yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(entries as any[]).map((entry) => (
              <div key={entry.id} className={`card-premium p-4 space-y-3 ${!entry.isVisible ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {editingId === entry.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input value={editForm.guestName} onChange={e => setEditForm(f => ({ ...f, guestName: e.target.value }))}
                            className="h-7 text-xs border border-border rounded-lg px-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="Guest name" />
                          <input value={editForm.hometown} onChange={e => setEditForm(f => ({ ...f, hometown: e.target.value }))}
                            className="h-7 text-xs border border-border rounded-lg px-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="Hometown" />
                        </div>
                        <textarea value={editForm.message} onChange={e => setEditForm(f => ({ ...f, message: e.target.value }))}
                          className="w-full text-xs border border-border rounded-lg p-2 resize-none bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                          rows={3} />
                        <div className="flex gap-1.5">
                          <Button size="sm" className="h-6 gap-1 text-xs px-2"
                            onClick={() => update.mutate({ id: entry.id, guestName: editForm.guestName, hometown: editForm.hometown || null, message: editForm.message })}
                            disabled={update.isPending}>
                            <Check className="w-2.5 h-2.5" />Save
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-sm">{entry.guestName}</span>
                          {entry.hometown && (
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <MapPin className="w-2.5 h-2.5" />{entry.hometown}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
                          {!entry.isVisible && <Badge variant="outline" className="text-xs">Hidden</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground italic">"{entry.message}"</p>
                      </>
                    )}
                  </div>
                  {editingId !== entry.id && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => update.mutate({ id: entry.id, isVisible: !entry.isVisible })}
                        className={`transition-colors ${entry.isVisible ? "text-emerald-500 hover:text-emerald-600" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
                        title={entry.isVisible ? "Hide" : "Show"}>
                        {entry.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => { setEditingId(entry.id); setEditForm({ guestName: entry.guestName, hometown: entry.hometown ?? "", message: entry.message }); }}
                        className="text-muted-foreground hover:text-foreground transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { if (confirm("Delete this entry?")) del.mutate({ id: entry.id }); }}
                        className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </HostLayout>
  );
}
