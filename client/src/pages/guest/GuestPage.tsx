import { useEffect, useMemo } from "react";
import { useLocation, useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronLeft, ChevronRight, Home, Lock } from "lucide-react";
import { Streamdown } from "streamdown";

function getSession() {
  try {
    const raw = sessionStorage.getItem("guest_session");
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      sessionStorage.removeItem("guest_session");
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export default function GuestPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const session = getSession();
  const { data: page, isLoading } = trpc.guest.page.useQuery({ slug }, { enabled: !!slug });
  const { data: allPages = [] } = trpc.guest.pages.useQuery();

  useEffect(() => {
    if (!session) navigate("/guest");
  }, [navigate, session]);

  const orderedPages = useMemo(() => (
    allPages
      .filter((candidate) => candidate.isVisible)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  ), [allPages]);
  const currentIndex = orderedPages.findIndex((candidate) => candidate.slug === slug);
  const previousPage = currentIndex > 0 ? orderedPages[currentIndex - 1] : null;
  const nextPage = currentIndex >= 0 && currentIndex < orderedPages.length - 1 ? orderedPages[currentIndex + 1] : null;

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center gap-3">
          <Link href="/guest/portal"><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div className="flex-1 min-w-0"><span className="font-serif text-base truncate block">{page?.title ?? "Loading..."}</span></div>
          <Link href="/guest/portal" className="shrink-0"><Button variant="ghost" size="icon" className="h-8 w-8"><Home className="w-4 h-4" /></Button></Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div>
        ) : !page ? (
          <div className="text-center py-16 text-muted-foreground"><p>Page not found.</p><Link href="/guest/portal"><Button variant="outline" className="mt-4">Back to portal</Button></Link></div>
        ) : (
          <>
            {(slug === "check-in" || slug === "access") && session.code && (
              <section className="rounded-2xl bg-primary/5 border border-primary/15 p-5 flex items-center gap-4 animate-fade-up">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Lock className="w-6 h-6 text-primary" /></div>
                <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Your Access Code</p><p className="font-mono font-bold text-3xl text-primary tracking-widest">{session.code}</p></div>
              </section>
            )}
            <div className="prose-rental animate-fade-up mt-6">
              <Streamdown
                rehypePlugins={[]}
                components={{
                  a: ({ href, children, ...props }: any) => {
                    const isInternal = Boolean(href && (href.startsWith("/") || (typeof window !== "undefined" && href.startsWith(window.location.origin))));
                    return <a href={href} {...props} target={isInternal ? "_self" : "_blank"} rel={isInternal ? undefined : "noopener noreferrer"}>{children}</a>;
                  },
                }}
              >
                {page.content ?? ""}
              </Streamdown>
            </div>
            <nav className="mt-10 pt-6 border-t border-border flex items-center justify-between gap-4">
              {previousPage ? <Link href={`/guest/portal/${previousPage.slug}`} className="flex-1"><button className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-secondary/50 transition-all text-left"><ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0" /><div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Previous</p><p className="text-sm font-medium truncate">{previousPage.title}</p></div></button></Link> : <div className="flex-1" />}
              {nextPage ? <Link href={`/guest/portal/${nextPage.slug}`} className="flex-1"><button className="w-full flex items-center justify-end gap-3 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-secondary/50 transition-all text-right"><div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Next</p><p className="text-sm font-medium truncate">{nextPage.title}</p></div><ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" /></button></Link> : <Link href="/guest/portal" className="flex-1"><button className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-secondary/50 transition-all"><Home className="w-4 h-4 text-muted-foreground" /><span className="text-sm font-medium">Back to portal</span></button></Link>}
            </nav>
          </>
        )}
      </main>
    </div>
  );
}
