import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Home } from "lucide-react";
import { Streamdown } from "streamdown";

function getSession() {
  try {
    const raw = sessionStorage.getItem("tenant_session");
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() > s.expiresAt) { sessionStorage.removeItem("tenant_session"); return null; }
    return s;
  } catch { return null; }
}

export default function TenantPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/tenant/portal/:slug");
  const slug = params?.slug ?? "";
  const session = getSession();

  useEffect(() => {
    if (!session) navigate("/tenant");
  }, []);

  const { data: page, isLoading } = trpc.tenant.page.useQuery({ slug }, { enabled: !!slug });

  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center gap-4">
          <button
            onClick={() => navigate("/tenant/portal")}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="flex-1 flex items-center gap-2">
            <Home className="w-4 h-4 text-gray-400" />
            <span className="font-serif text-base text-gray-900 truncate">
              {isLoading ? "Loading..." : page?.title ?? "Not found"}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : !page ? (
          <div className="text-center py-16 text-gray-400">
            <p>Page not found.</p>
            <button onClick={() => navigate("/tenant/portal")} className="mt-4 text-sm text-gray-600 hover:text-gray-900 underline">
              Back to portal
            </button>
          </div>
        ) : (
          <div className="prose prose-gray max-w-none">
            <Streamdown>{page.content}</Streamdown>
          </div>
        )}
      </main>
    </div>
  );
}
