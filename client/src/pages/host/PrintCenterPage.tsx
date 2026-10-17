import { useState } from "react";
import HostLayout from "@/components/HostLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, FileText, Printer } from "lucide-react";

interface PrintItem { title: string; description: string; file: string; format: string; note?: string; }

const PRINT_ITEMS: PrintItem[] = [
  { title: "House Manual", description: "A current guest manual generated from the pages you maintain in the host portal.", file: "/api/house-manual/pdf", format: "Letter · Multi-page · Portrait", note: "Generated fresh from your database" },
  { title: "Guest Portal QR Code", description: "A printable QR card that opens this deployment’s guest portal.", file: "/api/qr/guest", format: "5×7 in · Portrait" },
  { title: "Cleaner Portal QR Code", description: "A printable QR card that opens this deployment’s cleaner portal.", file: "/api/qr/cleaner", format: "5×7 in · Portrait" },
  { title: "Inspector Portal QR Code", description: "A printable QR card that opens this deployment’s inspection portal.", file: "/api/qr/inspector", format: "5×7 in · Portrait" },
];

export default function PrintCenterPage() {
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [printingFile, setPrintingFile] = useState<string | null>(null);
  async function fetchPdf(item: PrintItem) {
    const response = await fetch(item.file, { credentials: "same-origin", headers: { Accept: "application/pdf" } });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("application/pdf")) throw new Error(`The PDF could not be retrieved (${response.status || "unknown error"}).`);
    const blob = await response.blob();
    if (!blob.size) throw new Error("The PDF download was empty.");
    const headerName = (response.headers.get("content-disposition") ?? "").match(/filename="?([^";]+)"?/i)?.[1];
    return { blob, filename: (headerName || `${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`).replace(/[^a-z0-9._-]/gi, "-") };
  }
  async function downloadPdf(item: PrintItem) {
    try {
      setDownloadingFile(item.file);
      const { blob, filename } = await fetchPdf(item);
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement("a"), { href: url, download: filename });
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("PDF download started.");
    } catch { toast.error("The PDF could not be downloaded. Please reload and try again."); }
    finally { setDownloadingFile(null); }
  }
  async function printPdf(item: PrintItem) {
    const printWindow = window.open("", "_blank", "popup,width=960,height=760");
    if (!printWindow) { toast.error("Your browser blocked the print window. Please allow pop-ups and try again."); return; }
    try {
      setPrintingFile(item.file); printWindow.document.title = `Print — ${item.title}`; printWindow.document.body.textContent = "Preparing print preview…";
      const { blob } = await fetchPdf(item); const url = URL.createObjectURL(blob); const frame = printWindow.document.createElement("iframe");
      Object.assign(frame, { src: url, title: `${item.title} print preview` }); Object.assign(frame.style, { border: "0", width: "100%", height: "100vh" });
      frame.onload = () => window.setTimeout(() => { if (!printWindow.closed) { printWindow.focus(); printWindow.print(); } }, 250);
      printWindow.document.body.replaceChildren(frame); printWindow.addEventListener("beforeunload", () => URL.revokeObjectURL(url), { once: true }); toast.success("Print preview opened.");
    } catch { if (!printWindow.closed) printWindow.close(); toast.error("The PDF could not be prepared for printing. Please reload and try again."); }
    finally { setPrintingFile(null); }
  }
  return <HostLayout title="Print Center"><div className="max-w-3xl space-y-8"><div className="flex items-start gap-3"><Printer className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" /><p className="text-sm text-muted-foreground">Generate print materials from the current settings and data in this installation.</p></div><div className="space-y-3">{PRINT_ITEMS.map((item) => <div key={item.file} className="card-premium p-5 flex items-start gap-4"><div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-muted-foreground" /></div><div className="flex-1 min-w-0"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-sm">{item.title}</h3><p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.description}</p><div className="flex flex-wrap gap-2 mt-2"><span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{item.format}</span>{item.note && <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{item.note}</span>}</div></div><div className="flex shrink-0 gap-2"><Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => printPdf(item)} disabled={printingFile === item.file || downloadingFile === item.file}><Printer className="w-3.5 h-3.5" />{printingFile === item.file ? "Preparing..." : "Print"}</Button><Button type="button" size="sm" className="gap-1.5" onClick={() => downloadPdf(item)} disabled={downloadingFile === item.file || printingFile === item.file}><Download className="w-3.5 h-3.5" />{downloadingFile === item.file ? "Preparing..." : "Download"}</Button></div></div></div></div>)}</div><div className="rounded-xl border border-border bg-secondary/30 p-4 text-xs text-muted-foreground"><p className="font-medium text-foreground">Print tip</p><p>Print at actual size (100%) unless the document itself instructs otherwise.</p></div></div></HostLayout>;
}
