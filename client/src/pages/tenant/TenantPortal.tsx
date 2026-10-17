import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Home, FileText, Wrench, Zap, Shield, Car, Wifi, Phone, Map,
  ChevronRight, ArrowLeft, User
} from "lucide-react";

const ICON_MAP: Record<string, React.ReactNode> = {
  Home: <Home className="w-5 h-5" />,
  FileText: <FileText className="w-5 h-5" />,
  Wrench: <Wrench className="w-5 h-5" />,
  Zap: <Zap className="w-5 h-5" />,
  Shield: <Shield className="w-5 h-5" />,
  Car: <Car className="w-5 h-5" />,
  Wifi: <Wifi className="w-5 h-5" />,
  Phone: <Phone className="w-5 h-5" />,
  Map: <Map className="w-5 h-5" />,
};

// Section assignments
const YOUR_TENANCY_SLUGS = ["welcome", "lease", "maintenance", "utilities", "rules", "parking", "wifi", "contacts"];
// Everything else (local guide, etc.) goes to More

function getSession() {
  try {
    const raw = sessionStorage.getItem("tenant_session");
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() > s.expiresAt) { sessionStorage.removeItem("tenant_session"); return null; }
    return s;
  } catch { return null; }
}

interface PageCardProps {
  page: { id: number; slug: string; title: string; icon?: string | null };
  delay: number;
}

function PageCard({ page, delay }: PageCardProps) {
  return (
    <Link
      href={`/tenant/portal/${page.slug}`}
      className="group flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-white hover:border-gray-400 hover:shadow-md transition-all duration-200"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-gray-500 group-hover:bg-gray-900 group-hover:text-white transition-colors">
        {ICON_MAP[page.icon ?? "Home"] ?? <Home className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-900">{page.title}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-900 transition-colors shrink-0" />
    </Link>
  );
}

function Section({ title, pages, baseDelay }: { title: string; pages: { id: number; slug: string; title: string; icon?: string | null }[]; baseDelay: number }) {
  if (pages.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {pages.map((page, i) => (
          <PageCard key={page.id} page={page} delay={baseDelay + i * 0.04} />
        ))}
      </div>
    </div>
  );
}

export default function TenantPortal() {
  const [, navigate] = useLocation();
  const session = getSession();

  useEffect(() => {
    if (!session) navigate("/tenant");
  }, []);

  const { data: pages, isLoading } = trpc.tenant.pages.useQuery();

  if (!session) return null;

  // Deduplicate by slug
  const seen = new Set<string>();
  const visiblePages = (pages?.filter((p: any) => p.isVisible) ?? []).filter((p: any) => {
    if (seen.has(p.slug)) return false;
    seen.add(p.slug);
    return true;
  });

  const tenancyPages = visiblePages
    .filter((p: any) => YOUR_TENANCY_SLUGS.includes(p.slug))
    .sort((a: any, b: any) => YOUR_TENANCY_SLUGS.indexOf(a.slug) - YOUR_TENANCY_SLUGS.indexOf(b.slug));

  const morePages = visiblePages
    .filter((p: any) => !YOUR_TENANCY_SLUGS.includes(p.slug))
    .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Home className="w-6 h-6 text-gray-900" />
            <span className="font-serif text-lg text-gray-900">Vacation Rental Manager</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <User className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tenant</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Welcome */}
        <div>
          <h1 className="font-serif text-3xl text-gray-900 mb-3">Your Tenant Portal</h1>
          <div className="flex items-start gap-4 p-5 rounded-2xl bg-gray-900 text-white">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0 font-serif text-lg font-bold">
              <Home className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-sm mb-1 opacity-80">From Host, your landlord</p>
              <p className="text-sm leading-relaxed opacity-90">
                Welcome home. This portal has everything you need — lease info, maintenance contacts, building rules, and more. Reach out anytime if something comes up.
              </p>
              <p className="text-sm font-medium mt-2 opacity-80">— Host</p>
            </div>
          </div>
        </div>

        {/* Sections */}
        {isLoading ? (
          <div className="space-y-6">
            {[8, 2].map((count, si) => (
              <div key={si} className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[...Array(count)].map((_, i) => <Skeleton key={i} className="h-[62px] rounded-xl" />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            <Section title="Your Tenancy" pages={tenancyPages} baseDelay={0.1} />
            <Section title="More" pages={morePages} baseDelay={0.4} />
          </div>
        )}

        {/* Footer */}
        <div className="rounded-2xl bg-gray-900 text-white p-5 space-y-3">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0 font-serif text-lg font-bold">
              <Home className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-sm mb-1 opacity-80">Thank you for being a great tenant</p>
              <p className="text-sm opacity-70 leading-relaxed">
                I appreciate you taking care of the place. Don't hesitate to reach out if anything needs attention.
              </p>
              <p className="text-sm font-medium mt-2 opacity-80">— Host</p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200 text-center">
          <button
            onClick={() => { sessionStorage.removeItem("tenant_session"); navigate("/tenant"); }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1.5 mx-auto"
          >
            <ArrowLeft className="w-3 h-3" />
            Exit portal
          </button>
        </div>
      </main>
    </div>
  );
}
