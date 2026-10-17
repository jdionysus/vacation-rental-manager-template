import { Request, Response } from "express";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const PORTALS = {
  cleaner: { title: "CLEANING PORTAL", subtitle: "Scan to access the cleaning schedule and checklist", path: "/cleaner", color: "#d97706", light: "#fffbeb" },
  inspector: { title: "INSPECTION PORTAL", subtitle: "Scan to access the inspection schedule and checklist", path: "/inspector", color: "#0284c7", light: "#f0f9ff" },
  guest: { title: "GUEST GUIDE", subtitle: "Scan to access the guest portal and house manual", path: "/guest", color: "#7c3aed", light: "#f5f3ff" },
};

export async function portalQrPdfHandler(req: Request, res: Response) {
  const portal = (req.params.portal ?? "cleaner") as keyof typeof PORTALS;
  const config = PORTALS[portal] ?? PORTALS.cleaner;
  const protocol = String(req.headers["x-forwarded-proto"] ?? req.protocol).split(",")[0].trim();
  const origin = `${protocol}://${req.get("host")}`;
  const url = `${origin}${config.path}`;
  try {
    const qrBuffer = await QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 1, width: 300, color: { dark: "#1a1a1a", light: "#ffffff" } });
    const W = 360, H = 504, ML = 30, CW = W - 60;
    const doc = new PDFDocument({ size: [W, H], margins: { top: 30, bottom: 30, left: ML, right: ML }, info: { Title: `${config.title} QR Code`, Author: "Vacation Rental Manager" }, autoFirstPage: false });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${portal}-portal-qr.pdf"`);
    doc.pipe(res); doc.addPage();
    doc.rect(0, 0, W, H).fill("#faf8f4"); doc.rect(0, 0, W, 70).fill(config.color); doc.rect(0, 68, W, 2).fill("#1a1a1a");
    doc.font("Times-Bold").fontSize(11).fillColor("#ffffff").text("VACATION RENTAL MANAGER", ML, 24, { align: "center", width: CW, characterSpacing: 2 });
    doc.font("Helvetica-Bold").fontSize(13).fillColor(config.color).text(config.title, ML, 82, { align: "center", width: CW, characterSpacing: 2 });
    doc.font("Times-Italic").fontSize(9).fillColor("#5a5a5a").text(config.subtitle, ML, 100, { align: "center", width: CW, lineGap: 2 });
    const size = 200, x = (W - size) / 2, y = 126;
    doc.rect(x - 10, y - 10, size + 20, size + 20).fill(config.light).stroke(config.color).lineWidth(1.5);
    doc.image(qrBuffer, x, y, { width: size, height: size });
    doc.font("Helvetica").fontSize(8).fillColor("#5a5a5a").text(url, ML, y + size + 18, { align: "center", width: CW });
    doc.font("Times-Roman").fontSize(9).fillColor("#1a1a1a").text("Enter your access code when prompted.", ML, y + size + 54, { align: "center", width: CW });
    doc.rect(0, H - 36, W, 36).fill(config.color); doc.font("Times-Italic").fontSize(8).fillColor("rgba(255,255,255,0.8)").text("Generated for this installation", ML, H - 22, { align: "center", width: CW });
    doc.end();
  } catch (error) { console.error("[Portal QR PDF] Error:", error); if (!res.headersSent) res.status(500).send("Error generating QR PDF"); }
}
