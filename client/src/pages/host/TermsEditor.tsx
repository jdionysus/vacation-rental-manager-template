import { useState } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, Save } from "lucide-react";

export default function TermsEditor() {
  const { data: pages = [], refetch } = trpc.terms.list.useQuery();
  const updatePage = trpc.terms.update.useMutation({ onSuccess: () => { refetch(); toast.success("Terms page saved"); } });

  const [editing, setEditing] = useState<number | null>(null);
  const [editData, setEditData] = useState<{ title: string; content: string }>({ title: "", content: "" });

  function startEdit(page: typeof pages[0]) {
    setEditing(page.id);
    setEditData({ title: page.title, content: page.content ?? "" });
  }

  return (
    <HostLayout title="Terms Pages">
      <div className="max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Edit the legal terms shown to guests during the booking flow. All required terms must be accepted before payment.
        </p>

        <div className="space-y-3">
          {pages.map((page) => (
            <div key={page.id} className="card-premium overflow-hidden">
              <div className="flex items-center gap-4 p-4">
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{page.title}</span>
                    <Badge variant="secondary" className="text-xs font-mono">{page.slug}</Badge>
                    {page.isRequired && <Badge className="text-xs bg-red-50 text-red-700 border-red-200">Required</Badge>}
                  </div>
                  {page.content && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {page.content.replace(/[#*\n]/g, " ").slice(0, 80)}...
                    </p>
                  )}
                </div>
                <Button
                  variant="outline" size="sm"
                  onClick={() => editing === page.id ? setEditing(null) : startEdit(page)}
                >
                  {editing === page.id ? "Cancel" : "Edit"}
                </Button>
              </div>

              {editing === page.id && (
                <div className="border-t border-border p-4 space-y-3 bg-secondary/20">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Title</label>
                    <Input value={editData.title} onChange={(e) => setEditData({ ...editData, title: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Content (Markdown)</label>
                    <Textarea
                      value={editData.content}
                      onChange={(e) => setEditData({ ...editData, content: e.target.value })}
                      rows={14}
                      className="font-mono text-sm resize-y"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                    <Button
                      size="sm"
                      onClick={() => { updatePage.mutate({ id: page.id, ...editData }); setEditing(null); }}
                      disabled={updatePage.isPending}
                      className="gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </HostLayout>
  );
}
