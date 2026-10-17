import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MessageSquare, Calendar, Users, CheckCircle2, XCircle, Eye } from "lucide-react";
import { formatDate, formatDateShort } from "@/lib/dateUtils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_STYLES: Record<string, string> = {
  new: "bg-amber-50 text-amber-700 border-amber-200",
  reviewed: "bg-blue-50 text-blue-700 border-blue-200",
  converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-red-50 text-red-600 border-red-200",
};

export default function BookingRequestsPage() {
  const { data: requests = [], refetch } = trpc.bookingRequests.list.useQuery();
  const updateRequest = trpc.bookingRequests.update.useMutation({ onSuccess: () => { refetch(); toast.success("Updated"); } });

  const newCount = requests.filter((r) => r.status === "new").length;

  return (
    <HostLayout title="Booking Requests">
      <div className="max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          {newCount > 0 ? <><strong>{newCount} new</strong> request{newCount > 1 ? "s" : ""} awaiting review.</> : "All requests reviewed."}
        </p>

        {requests.length === 0 ? (
          <div className="card-premium p-10 text-center text-muted-foreground space-y-3">
            <MessageSquare className="w-8 h-8 mx-auto opacity-30" />
            <p>No booking requests yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div key={req.id} className="card-premium p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{req.guestName}</span>
                      <Badge className={`text-xs border ${STATUS_STYLES[req.status]}`}>{req.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{req.guestEmail}</p>
                    {req.guestPhone && <p className="text-sm text-muted-foreground">{req.guestPhone}</p>}
                  </div>
                  <Select
                    value={req.status}
                    onValueChange={(v) => updateRequest.mutate({ id: req.id, status: v as typeof req.status })}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="reviewed">Reviewed</SelectItem>
                      <SelectItem value="converted">Converted</SelectItem>
                      <SelectItem value="declined">Declined</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDateShort(req.arrivalDate)}
                    {" → "}
                    {formatDate(req.departureDate, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {req.guestCount} guest{(req.guestCount ?? 1) > 1 ? "s" : ""}
                  </span>
                  <span className="text-xs">
                    {formatDate(req.createdAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                {req.message && (
                  <div className="p-3 rounded-lg bg-secondary/50 text-sm text-muted-foreground italic">
                    "{req.message}"
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </HostLayout>
  );
}
