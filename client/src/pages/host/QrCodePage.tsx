import { useEffect, useState } from "react";
import HostLayout from "@/components/HostLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Printer, Copy, ExternalLink } from "lucide-react";
import QRCode from "qrcode";

export default function QrCodePage() {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [portalUrl, setPortalUrl] = useState("");

  useEffect(() => {
    const url = `${window.location.origin}/guest`;
    setPortalUrl(url);
    QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: "#1a1a2e", light: "#ffffff" }, errorCorrectionLevel: "H" }).then(setQrDataUrl);
  }, []);

  function handleDownload() {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = "guest-portal-qr.png";
    link.click();
    toast.success("QR code downloaded");
  }

  function handlePrint() {
    if (!qrDataUrl || !portalUrl) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<html><head><title>Guest Portal QR Code</title><style>body{font-family:Georgia,serif;text-align:center;padding:60px 40px;background:#fff}h1{font-size:30px;margin-bottom:6px;color:#1a1a2e}.sub{color:#666;font-size:15px;margin-bottom:24px}img{margin:0 auto;display:block;border-radius:12px}.instructions{max-width:340px;margin:24px auto 0;font-size:13px;color:#555;line-height:1.7}</style></head><body><h1>Welcome to Your Stay</h1><p class="sub">Scan to open your guest guide</p><img src="${qrDataUrl}" width="260" height="260" /><div class="instructions"><p>Point your phone camera at the QR code, then enter the access code from your welcome message to open stay details and local recommendations.</p><p style="color:#aaa;font-size:11px;margin-top:12px">${portalUrl}</p></div></body></html>`);
    printWindow.document.close();
    printWindow.print();
  }

  return (
    <HostLayout title="Guest QR Code">
      <div className="max-w-lg space-y-6"><p className="text-sm text-muted-foreground">Print this QR code and place it in the property. Guests scan it, then enter the access code from their welcome message.</p>{qrDataUrl ? <div className="card-premium p-8 text-center space-y-5"><div className="bg-white rounded-2xl p-6 inline-block mx-auto border border-gray-100 shadow-sm"><img src={qrDataUrl} alt="Guest QR Code" className="w-64 h-64 mx-auto" /><p className="text-sm text-gray-400 mt-3">Scan to access guest portal</p></div><div className="flex flex-wrap gap-3 justify-center"><Button onClick={handleDownload} variant="outline" className="gap-2"><Download className="w-4 h-4" />Download</Button><Button onClick={handlePrint} className="gap-2"><Printer className="w-4 h-4" />Print</Button><Button variant="outline" onClick={() => { navigator.clipboard.writeText(portalUrl); toast.success("Link copied!"); }} className="gap-2"><Copy className="w-4 h-4" />Copy Link</Button><a href={portalUrl} target="_blank" rel="noopener noreferrer"><Button variant="outline" className="gap-2"><ExternalLink className="w-4 h-4" />Test</Button></a></div><p className="text-xs text-muted-foreground font-mono break-all">{portalUrl}</p></div> : <div className="card-premium p-10 text-center text-muted-foreground">Generating QR code...</div>}</div>
    </HostLayout>
  );
}
