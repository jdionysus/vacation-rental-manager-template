import { useState } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, Plus, Trash2, Eye, EyeOff, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-violet-50 text-violet-700 border-violet-200",
  host: "bg-primary/10 text-primary border-primary/20",
  property_manager: "bg-blue-50 text-blue-700 border-blue-200",
  cleaner: "bg-emerald-50 text-emerald-700 border-emerald-200",
  accountant: "bg-amber-50 text-amber-700 border-amber-200",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", host: "Host", property_manager: "Co-host",
  cleaner: "Cleaner", accountant: "Accountant",
};

export default function TeamPage() {
  const { data: users = [], refetch } = trpc.team.list.useQuery();
  const updateRole = trpc.team.updateRole.useMutation({ onSuccess: () => { refetch(); toast.success("Role updated"); } });
  const createMember = trpc.team.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); resetForm(); toast.success("Team member added"); },
    onError: (err) => toast.error(err.message ?? "Failed to add member"),
  });
  const deleteMember = trpc.team.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Team member removed"); },
    onError: (err) => toast.error(err.message ?? "Failed to remove member"),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "cleaner" as "host" | "property_manager" | "cleaner" | "accountant" | "admin" });

  function resetForm() {
    setForm({ email: "", password: "", name: "", role: "cleaner" });
    setShowPw(false);
  }

  return (
    <HostLayout title="Team">
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Manage team access and roles.</p>
          <Button onClick={() => setShowAdd(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Add Member
          </Button>
        </div>

        {/* Role permissions reference */}
        <div className="card-premium p-4 space-y-2 text-sm">
          <p className="font-medium text-sm">Role permissions</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-muted-foreground">
            <div><strong>Host / Admin</strong> — Full access</div>
            <div><strong>Co-host</strong> — Bookings, tasks, guest pages</div>
            <div><strong>Cleaner</strong> — Tasks only (own assignments)</div>
            <div><strong>Accountant</strong> — Costs and reports (read-only)</div>
          </div>
        </div>

        {/* Team list */}
        {users.length === 0 ? (
          <div className="card-premium p-10 text-center text-muted-foreground space-y-3">
            <Users className="w-8 h-8 mx-auto opacity-30" />
            <p>No team members yet. Add your first member above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div key={user.id} className="card-premium p-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-medium shrink-0">
                  {user.name?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{user.name ?? "No name"}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <Select
                  value={user.role}
                  onValueChange={(v) => updateRole.mutate({ userId: user.id, role: v as typeof user.role })}
                >
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="host">Host</SelectItem>
                    <SelectItem value="property_manager">Co-host</SelectItem>
                    <SelectItem value="cleaner">Cleaner</SelectItem>
                    <SelectItem value="accountant">Accountant</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost" size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                  onClick={() => {
                    if (confirm(`Remove ${user.name ?? user.email} from the team?`)) {
                      deleteMember.mutate({ userId: user.id });
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Member Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) resetForm(); setShowAdd(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Add Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Email *</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Password *</label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Minimum 8 characters"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Share these credentials with the team member so they can log in at /host/login</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Role</label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as typeof form.role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="host">Host</SelectItem>
                  <SelectItem value="property_manager">Co-host</SelectItem>
                  <SelectItem value="cleaner">Cleaner</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setShowAdd(false); }}>Cancel</Button>
            <Button
              onClick={() => createMember.mutate(form)}
              disabled={!form.email || form.password.length < 8 || createMember.isPending}
              className="gap-1.5"
            >
              {createMember.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding...</> : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HostLayout>
  );
}
