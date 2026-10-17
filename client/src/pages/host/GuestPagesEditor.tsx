import { useState, useEffect } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Eye, EyeOff, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import MarkdownEditor from "@/components/MarkdownEditor";

// Guest pages are data-driven. Configure page titles, ordering, and content in
// the database instead of maintaining property-specific page slugs in source.
const SECTIONS: { label: string; slugs: string[] }[] = [];

// ─── Widget field definitions for core pages ─────────────────────────────────
type WidgetField = { key: string; label: string; placeholder?: string; type?: "text" | "time" | "number" };

const PAGE_WIDGETS: Record<string, { title: string; fields: WidgetField[] }> = {
  "check-in": {
    title: "Check-In Settings",
    fields: [
      { key: "checkin_time", label: "Check-In Time", placeholder: "e.g. 4:00 PM", type: "text" },
      { key: "checkout_time", label: "Check-Out Time", placeholder: "e.g. 11:00 AM", type: "text" },
      { key: "door_code", label: "Door Code", placeholder: "e.g. 1234" },
      { key: "address", label: "Address", placeholder: "e.g. 1234 Maple St, Example City, ST" },
    ],
  },
  "checkout": {
    title: "Checkout Settings",
    fields: [
      { key: "checkout_time", label: "Check-Out Time", placeholder: "e.g. 11:00 AM", type: "text" },
    ],
  },
  "access": {
    title: "Door Access",
    fields: [
      { key: "door_code", label: "Door Code", placeholder: "e.g. 1234" },
      { key: "gate_code", label: "Gate Code (if any)", placeholder: "e.g. 5678" },
    ],
  },
  "wifi": {
    title: "WiFi Settings",
    fields: [
      { key: "wifi_network", label: "Network Name (SSID)", placeholder: "e.g. YOUR_GUEST_WIFI" },
      { key: "wifi_password", label: "Password", placeholder: "Leave blank if open network" },
    ],
  },
  "parking": {
    title: "Parking Info",
    fields: [
      { key: "parking_spots", label: "Number of Spots", placeholder: "e.g. 2", type: "number" },
      { key: "parking_notes", label: "Parking Notes", placeholder: "e.g. Pull all the way in off Maple St" },
    ],
  },
  "emergency": {
    title: "Emergency Contacts",
    fields: [
      { key: "host_phone", label: "Host Phone", placeholder: "e.g. (210) 467-2312" },
      { key: "emergency_phone", label: "Emergency / 911", placeholder: "911" },
    ],
  },
};

// Parse widget values from markdown content
function parseWidgetValues(content: string, fields: WidgetField[]): Record<string, string> {
  const vals: Record<string, string> = {};
  for (const f of fields) {
    const match = content.match(new RegExp(`<!-- ${f.key}: (.*?) -->`));
    vals[f.key] = match ? match[1] : "";
  }
  return vals;
}

// Inject/update widget values as HTML comments in markdown
function injectWidgetValues(content: string, fields: WidgetField[], vals: Record<string, string>): string {
  let updated = content;
  for (const f of fields) {
    const tag = `<!-- ${f.key}: ${vals[f.key] ?? ""} -->`;
    const existing = new RegExp(`<!-- ${f.key}: .*? -->`);
    if (existing.test(updated)) {
      updated = updated.replace(existing, tag);
    } else {
      // Prepend widget data as comments at the top
      updated = tag + "\n" + updated;
    }
  }
  return updated;
}

// ─── Page card component ──────────────────────────────────────────────────────
function PageCard({ page, onSave, onToggleVisible }: {
  page: { id: number; slug: string; title: string; content: string | null; isVisible: boolean | null };
  onSave: (id: number, data: { title: string; content: string }) => void;
  onToggleVisible: (id: number, visible: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content ?? "");
  const [widgetVals, setWidgetVals] = useState<Record<string, string>>({});
  const widget = PAGE_WIDGETS[page.slug];

  useEffect(() => {
    setTitle(page.title);
    setContent(page.content ?? "");
    if (widget) {
      setWidgetVals(parseWidgetValues(page.content ?? "", widget.fields));
    }
  }, [page.id, page.content]);

  function handleSave() {
    let finalContent = content;
    if (widget) {
      finalContent = injectWidgetValues(content, widget.fields, widgetVals);
    }
    onSave(page.id, { title, content: finalContent });
    setOpen(false);
  }

  const preview = (page.content ?? "").replace(/<!--.*?-->/g, "").replace(/[#*\n]/g, " ").trim().slice(0, 100);

  return (
    <div className="card-premium overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={() => onToggleVisible(page.id, !page.isVisible)}
          className={`shrink-0 transition-colors ${page.isVisible ? "text-emerald-500" : "text-muted-foreground/40"}`}
          title={page.isVisible ? "Visible" : "Hidden"}
        >
          {page.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setOpen(o => !o)}>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{page.title}</span>
            {widget && <Settings2 className="w-3 h-3 text-primary/60" />}
            <Badge variant="secondary" className="text-[10px] font-mono">{page.slug}</Badge>
          </div>
          {!open && preview && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{preview}...</p>
          )}
        </div>
        <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-foreground shrink-0">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Editor panel */}
      {open && (
        <div className="border-t border-border p-4 space-y-4 bg-secondary/10">
          {/* Title */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Page Title</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="h-8 text-sm" />
          </div>

          {/* Widget fields for core pages */}
          {widget && (
            <div className="rounded-xl border border-primary/20 bg-primary/3 p-3 space-y-3">
              <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                <Settings2 className="w-3 h-3" />{widget.title}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {widget.fields.map(f => (
                  <div key={f.key}>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-0.5">{f.label}</label>
                    <Input
                      value={widgetVals[f.key] ?? ""}
                      onChange={e => setWidgetVals(v => ({ ...v, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      type={f.type ?? "text"}
                      className="h-7 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rich text editor */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Content</label>
            <MarkdownEditor
              value={content.replace(/<!--.*?-->\n?/g, "")}
              onChange={setContent}
              placeholder="Write page content here..."
              minHeight="180px"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} className="gap-1.5">
              <Save className="w-3.5 h-3.5" />Save Page
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function GuestPagesEditor() {
  const { data: pages = [], refetch } = trpc.guestPages.list.useQuery();
  const updatePage = trpc.guestPages.update.useMutation({
    onSuccess: () => { refetch(); toast.success("Page saved"); },
    onError: (err) => toast.error(err.message ?? "Failed to save"),
  });

  function handleSave(id: number, data: { title: string; content: string }) {
    updatePage.mutate({ id, ...data });
  }

  function handleToggleVisible(id: number, visible: boolean) {
    updatePage.mutate({ id, isVisible: visible });
  }

  // Group pages by section
  const slugToPage = new Map(pages.map(p => [p.slug, p]));
  const assignedSlugs = new Set(SECTIONS.flatMap(s => s.slugs));
  const otherPages = pages.filter(p => !assignedSlugs.has(p.slug));

  return (
    <HostLayout title="Guest Pages">
      <div className="max-w-3xl space-y-8">
        <p className="text-sm text-muted-foreground">
          Edit the content guests see in their portal. Click any page to edit. Changes are live immediately.
        </p>

        {SECTIONS.map(section => {
          const sectionPages = section.slugs.map(s => slugToPage.get(s)).filter(Boolean) as typeof pages;
          if (sectionPages.length === 0) return null;
          return (
            <div key={section.label} className="space-y-2">
              <h2 className="font-serif text-base text-foreground border-b border-border pb-2">{section.label}</h2>
              <div className="space-y-2">
                {sectionPages.map(page => (
                  <PageCard
                    key={page.id}
                    page={page as any}
                    onSave={handleSave}
                    onToggleVisible={handleToggleVisible}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {otherPages.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-serif text-base text-foreground border-b border-border pb-2">More</h2>
            <div className="space-y-2">
              {otherPages.map(page => (
                <PageCard
                  key={page.id}
                  page={page as any}
                  onSave={handleSave}
                  onToggleVisible={handleToggleVisible}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </HostLayout>
  );
}
