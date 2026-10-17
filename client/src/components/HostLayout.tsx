import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutDashboard, Calendar, BookOpen, Users, ClipboardList, CheckCircle, AlertTriangle,
  DollarSign, TrendingUp, Rss, FileText, LogOut, Menu,
  Home, ChevronRight, ChevronDown, CreditCard, Shield, QrCode, Printer, Brush, Banknote
} from "lucide-react";

type Role = "host" | "property_manager" | "cleaner" | "accountant" | "admin";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: Role[];
}

interface NavGroup {
  label: string;
  icon: React.ReactNode;
  roles: Role[];
  items: NavItem[];
}

// Top-level direct links (always visible, no group)
const TOP_LINKS: NavItem[] = [
  { href: "/host", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, roles: ["host", "property_manager", "admin"] },
  { href: "/host/reservation-calendar", label: "Calendar", icon: <Calendar className="w-4 h-4" />, roles: ["host", "property_manager", "cleaner", "admin"] },
  { href: "/host/reservations", label: "Reservations", icon: <BookOpen className="w-4 h-4" />, roles: ["host", "property_manager", "admin"] },
  { href: "/host/ical", label: "iCal Feeds", icon: <Rss className="w-4 h-4" />, roles: ["host", "property_manager", "admin"] },
];

// Collapsible groups
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Pricing",
    icon: <DollarSign className="w-4 h-4" />,
    roles: ["host", "property_manager", "admin"],
    items: [
      { href: "/host/rates", label: "Rate Calendar", icon: <DollarSign className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "admin"] },
    ],
  },
  {
    label: "Operations",
    icon: <Brush className="w-4 h-4" />,
    roles: ["host", "property_manager", "cleaner", "admin"],
    items: [
      { href: "/host/tasks", label: "Tasks", icon: <ClipboardList className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "cleaner", "admin"] },
      { href: "/host/checklists", label: "Checklists", icon: <CheckCircle className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "admin"] },
      { href: "/host/cleans", label: "Cleans", icon: <Brush className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "admin"] },
      { href: "/host/issues", label: "Property Issues", icon: <AlertTriangle className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "admin"] },
    ],
  },
  {
    label: "Financials",
    icon: <Banknote className="w-4 h-4" />,
    roles: ["host", "property_manager", "accountant", "admin"],
    items: [
      { href: "/host/financials", label: "Revenue & Payouts", icon: <TrendingUp className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "accountant", "admin"] },
    ],
  },
  {
    label: "Costs",
    icon: <CreditCard className="w-4 h-4" />,
    roles: ["host", "property_manager", "accountant", "admin"],
    items: [
      { href: "/host/costs", label: "Costs", icon: <DollarSign className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "accountant", "admin"] },
      { href: "/host/damage", label: "Damage Charges", icon: <CreditCard className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "admin"] },
    ],
  },
  {
    label: "Guest",
    icon: <FileText className="w-4 h-4" />,
    roles: ["host", "property_manager", "admin"],
    items: [
      { href: "/host/guest-pages", label: "Guest Pages", icon: <FileText className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "admin"] },
      { href: "/host/terms", label: "Terms Pages", icon: <Shield className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "admin"] },
      { href: "/host/ota-links", label: "OTA Links", icon: <Rss className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "admin"] },
      { href: "/host/qr-code", label: "Guest QR Code", icon: <QrCode className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "admin"] },
    ],
  },
  {
    label: "Settings",
    icon: <Users className="w-4 h-4" />,
    roles: ["host", "property_manager", "admin"],
    items: [
      { href: "/host/settings", label: "Property", icon: <Home className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "admin"] },
      { href: "/host/bypass-codes", label: "Bypass Codes", icon: <Shield className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "admin"] },
      { href: "/host/guestbook", label: "Guestbook", icon: <BookOpen className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "admin"] },
      { href: "/host/print", label: "Print Center", icon: <Printer className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "admin"] },
      { href: "/host/team", label: "Team", icon: <Users className="w-3.5 h-3.5" />, roles: ["host", "property_manager", "admin"] },
    ],
  },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function HostLayout({ children, title }: Props) {
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const { data: property } = trpc.property.get.useQuery();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => navigate("/host/login"),
  });

  // Track which groups are expanded — auto-expand the active group
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const active = new Set<string>();
    for (const group of NAV_GROUPS) {
      if (group.items.some(item => location === item.href || location.startsWith(item.href))) {
        active.add(group.label);
      }
    }
    return active;
  });

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/host/login");
    }
  }, [isLoading, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-3 w-64">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const role = (user.role ?? "host") as Role;
  const propertyName = property?.name ?? "Property Manager";

  function toggleGroup(label: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-border">
        <Link href="/" className="flex items-center gap-2.5">
          <Home className="w-6 h-6 text-primary" />
          <span className="font-serif text-base">{propertyName}</span>
        </Link>
        <div className="mt-3 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-medium">
            {user.name?.[0]?.toUpperCase() ?? "H"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{user.name ?? "Host"}</p>
            <p className="text-xs text-muted-foreground capitalize">{role.replace("_", " ")}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {/* Top-level direct links */}
        {TOP_LINKS.filter(item => item.roles.includes(role)).map((item) => {
          const isActive = location === item.href || (item.href !== "/host" && location.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {item.icon}
              {item.label}
              {isActive && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
            </Link>
          );
        })}

        {/* Collapsible groups */}
        {NAV_GROUPS.filter(g => g.roles.includes(role)).map((group) => {
          const visibleItems = group.items.filter(item => item.roles.includes(role));
          if (visibleItems.length === 0) return null;
          const isGroupActive = visibleItems.some(item => location === item.href || location.startsWith(item.href));
          const isExpanded = expandedGroups.has(group.label) || isGroupActive;

          return (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isGroupActive
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {group.icon}
                <span className="flex-1 text-left">{group.label}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </button>
              {isExpanded && (
                <div className="ml-3 pl-3 border-l border-border space-y-0.5 mb-1">
                  {visibleItems.map((item) => {
                    const isActive = location === item.href || location.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                          isActive
                            ? "bg-primary text-primary-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }`}
                      >
                        {item.icon}
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-border space-y-1">
        <Link href="/" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
          <Home className="w-4 h-4" />
          View listing
        </Link>
        <button
          onClick={() => logout.mutate()}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden lg:flex flex-col w-56 border-r border-border bg-card shrink-0 fixed inset-y-0 left-0 z-30">
        <Sidebar />
      </aside>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-50 w-64 bg-card border-r border-border flex flex-col">
            <Sidebar />
          </aside>
        </div>
      )}

      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-sm border-b border-border h-14 flex items-center px-6 gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-4 h-4" />
          </Button>
          <Link href="/" className="lg:hidden flex items-center gap-2">
            <Home className="w-5 h-5 text-primary" />
            <span className="font-serif text-sm">{propertyName}</span>
          </Link>
          {title && <h1 className="font-serif text-xl hidden lg:block">{title}</h1>}
        </header>

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
