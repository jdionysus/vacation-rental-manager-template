import { useMemo } from "react";
import { Link } from "wouter";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getUpcomingReservations } from "@shared/reservation-display";
import {
  Calendar, BookOpen, ClipboardList, DollarSign,
  ArrowRight, TrendingUp, Users, Clock, AlertCircle
} from "lucide-react";
import { formatDate, formatDateShort } from "@/lib/dateUtils";

function StatCard({ label, value, icon, href, color = "bg-secondary" }: {
  label: string; value: string | number; icon: React.ReactNode; href?: string; color?: string;
}) {
  const inner = (
    <div className="card-premium p-5 flex items-center gap-4 hover:shadow-md transition-all">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
      {href && <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto" />}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function Dashboard() {
  const { data: reservations, isLoading: resLoading } = trpc.reservations.list.useQuery();
  const { data: tasks, isLoading: tasksLoading } = trpc.tasks.list.useQuery();
  const { data: costs, isLoading: costsLoading } = trpc.costs.list.useQuery();
  const { data: requests } = trpc.bookingRequests.list.useQuery();

  const today = new Date().toISOString().split("T")[0];

  // Helper: safely convert Date object or string to YYYY-MM-DD
  function toDateStr(val: unknown): string {
    if (!val) return '';
    if (val instanceof Date) return val.toISOString().split('T')[0];
    const s = String(val);
    if (s.includes('T')) return s.split('T')[0];
    if (s.includes(' ') && s.length > 10) { const d = new Date(s); if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]; }
    return s.slice(0, 10);
  }

  const stats = useMemo(() => {
    const upcomingCount = getUpcomingReservations(reservations, today).length;
    
    const pendingTasks = tasks?.filter((t) => t.status === "pending" || t.status === "in_progress") ?? [];
    const newRequests = requests?.filter((r) => r.status === "new") ?? [];
    const thisMonthCosts = costs?.filter((c) => {
      const d = toDateStr(c.costDate);
      return d.startsWith(today.slice(0, 7));
    }) ?? [];
    const monthTotal = thisMonthCosts.reduce((sum, c) => sum + parseFloat(c.amount ?? "0"), 0);
    return { upcoming: upcomingCount, pendingTasks: pendingTasks.length, newRequests: newRequests.length, monthTotal };
  }, [reservations, tasks, costs, requests, today]);

  const nextArrival = useMemo(() => {
    return getUpcomingReservations(reservations, today)
      .map(r => ({ guestName: r.guestName, arrivalDate: toDateStr(r.arrivalDate), departureDate: toDateStr(r.departureDate), status: r.status, source: r.source }))
      .sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate))
      .slice(0, 3);
  }, [reservations, today]);

  const pendingTasks = tasks?.filter((t) => t.status === "pending" || t.status === "in_progress").slice(0, 3) ?? [];
  const newRequests = requests?.filter((r) => r.status === "new").slice(0, 3) ?? [];

  return (
    <HostLayout title="Dashboard">
      <div className="max-w-5xl space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {resLoading ? (
            [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          ) : (
            <>
              <StatCard label="Upcoming stays" value={stats.upcoming} icon={<BookOpen className="w-5 h-5 text-primary" />} href="/host/reservations" color="bg-primary/10" />
              <StatCard label="Pending tasks" value={stats.pendingTasks} icon={<ClipboardList className="w-5 h-5 text-amber-600" />} href="/host/tasks" color="bg-amber-50" />
              <StatCard label="New requests" value={stats.newRequests} icon={<Users className="w-5 h-5 text-emerald-600" />} href="/host/requests" color="bg-emerald-50" />
              <StatCard label="Costs this month" value={`$${stats.monthTotal.toFixed(0)}`} icon={<DollarSign className="w-5 h-5 text-violet-600" />} href="/host/costs" color="bg-violet-50" />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Arrivals */}
          <div className="card-premium p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl">Upcoming Arrivals</h2>
              <Link href="/host/reservation-calendar">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  Calendar <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            {resLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : nextArrival.length > 0 ? (
              <div className="space-y-2">
                {nextArrival.map((arrival, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{arrival.guestName ?? "Guest"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(arrival.arrivalDate, { weekday: "short", month: "short", day: "numeric" })}
                        {" → "}
                        {formatDateShort(arrival.departureDate)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-[10px]">
                          {arrival.status.replace("_", " ")}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground capitalize">{arrival.source.replace("_", ".")}</span>
                      </div>
                    </div>
                    {('id' in arrival) && (arrival as any).id && (
                      <Link href={`/host/reservations/${(arrival as any).id}`}>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/30 text-muted-foreground text-sm">
                <Clock className="w-4 h-4 shrink-0" />
                No upcoming arrivals
              </div>
            )}
          </div>

          {/* Pending Tasks */}
          <div className="card-premium p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl">Open Tasks</h2>
              <Link href="/host/tasks">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  All tasks <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            {tasksLoading ? (
              <Skeleton className="h-20" />
            ) : pendingTasks.length > 0 ? (
              <div className="space-y-2">
                {pendingTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${task.status === "in_progress" ? "bg-amber-500" : "bg-slate-300"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      {task.dueDate && (
                        <p className="text-xs text-muted-foreground">
                          Due {formatDateShort(task.dueDate)}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs capitalize shrink-0">
                      {task.type}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/30 text-muted-foreground text-sm">
                <ClipboardList className="w-4 h-4 shrink-0" />
                No open tasks
              </div>
            )}
          </div>

          {/* New Booking Requests */}
          <div className="card-premium p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl">Booking Requests</h2>
              <Link href="/host/requests">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  All requests <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            {newRequests.length > 0 ? (
              <div className="space-y-2">
                {newRequests.map((req) => (
                  <div key={req.id} className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{req.guestName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateShort(req.arrivalDate)}
                        {" → "}
                        {formatDateShort(req.departureDate)}
                      </p>
                    </div>
                    <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200 shrink-0">New</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/30 text-muted-foreground text-sm">
                <Users className="w-4 h-4 shrink-0" />
                No new requests
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="card-premium p-5 space-y-4">
            <h2 className="font-serif text-xl">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: "/host/reservations", label: "Add Reservation", icon: <BookOpen className="w-4 h-4" /> },
                { href: "/host/calendar", label: "Block Dates", icon: <Calendar className="w-4 h-4" /> },
                { href: "/host/tasks", label: "Add Task", icon: <ClipboardList className="w-4 h-4" /> },
                { href: "/host/costs", label: "Log Cost", icon: <DollarSign className="w-4 h-4" /> },
              ].map((action) => (
                <Link key={action.href} href={action.href}>
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm h-10">
                    {action.icon}
                    {action.label}
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </HostLayout>
  );
}
