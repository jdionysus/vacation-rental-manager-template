import { Request, Response } from "express";
import PDFDocument from "pdfkit";
import { getGuestPages } from "./db";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  ink:    "#1a1a1a",
  mid:    "#5a5a5a",
  soft:   "#b8b8b8",
  rule:   "#d0c8bc",
  cream:  "#faf8f4",
  accent: "#8b4513",
  white:  "#ffffff",
};
const F = {
  serif:  "Times-Roman",
  bold:   "Times-Bold",
  italic: "Times-Italic",
  sans:   "Helvetica",
  sansB:  "Helvetica-Bold",
};
const PW = 612, PH = 792;
const ML = 54, MR = 54, MT = 54, MB = 48;
const CW = PW - ML - MR;   // 504
const SAFE = PH - MB - 16;

// ─── Markdown parser ──────────────────────────────────────────────────────────
type Tok = { t: "h1"|"h2"|"h3"|"p"|"bullet"|"hr"|"blank"; text?: string; level?: number };

const clean = (s: string) => s
  .replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1")
  .replace(/__(.+?)__/g, "$1").replace(/_(.+?)_/g, "$1")
  .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/`(.+?)`/g, "$1")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

const parse = (md: string): Tok[] => {
  const raw: (Tok|null)[] = md.split("\n").map(l => {
    const t = l.trim();
    if (!t) return { t: "blank" } as Tok;
    if (/^[→←►◄]/.test(t)) return null;
    if (/^---+$/.test(t) || /^\*\*\*+$/.test(t)) return { t: "hr" } as Tok;
    if (t.startsWith("# "))   return { t: "h1", text: clean(t.slice(2)) } as Tok;
    if (t.startsWith("## "))  return { t: "h2", text: clean(t.slice(3)) } as Tok;
    if (t.startsWith("### ")) return { t: "h3", text: clean(t.slice(4)) } as Tok;
    const bm = l.match(/^(\s*)([-*•]|\d+\.)\s+(.+)/);
    if (bm) return { t: "bullet", text: clean(bm[3]), level: Math.floor(bm[1].length / 2) } as Tok;
    return { t: "p", text: clean(t) } as Tok;
  });
  const out: Tok[] = [];
  let lb = false;
  for (const tok of raw) {
    if (!tok) continue;
    if (tok.t === "blank") { if (!lb) out.push(tok); lb = true; }
    else { out.push(tok); lb = false; }
  }
  return out;
};

// ─── Page manager ─────────────────────────────────────────────────────────────
class PageManager {
  doc: PDFKit.PDFDocument;
  y: number = MT;
  pageNum: number = 0;
  sectionTitle: string = "";

  constructor(doc: PDFKit.PDFDocument) {
    this.doc = doc;
  }

  startPage(title?: string) {
    this.doc.addPage();
    this.pageNum++;
    if (title !== undefined) this.sectionTitle = title;
    // Cream background
    this.doc.rect(0, 0, PW, PH).fill(C.cream);
    // Top masthead rules
    this.doc.rect(ML, MT - 22, CW, 2).fill(C.ink);
    this.doc.rect(ML, MT - 18, CW, 0.5).fill(C.rule);
    this.y = MT;
  }

  footer() {
    const fy = PH - MB + 8;
    this.doc.rect(ML, fy - 4, CW, 0.5).fill(C.rule);
    this.doc.font(F.italic).fontSize(7.5).fillColor(C.soft);
    this.doc.text("Vacation Rental Manager  ·  Your Property", ML, fy, { width: CW / 2, align: "left" });
    if (this.sectionTitle) {
      this.doc.font(F.italic).fontSize(7.5).fillColor(C.mid);
      this.doc.text(this.sectionTitle, ML + CW / 2 - 80, fy, { width: 160, align: "center" });
    }
    this.doc.font(F.sans).fontSize(7.5).fillColor(C.mid);
    this.doc.text(`${this.pageNum}`, ML, fy, { width: CW, align: "right" });
  }

  ensureSpace(needed: number) {
    if (this.y + needed > SAFE) {
      this.footer();
      this.startPage();
      // Continuation strip
      this.doc.rect(ML - 4, MT - 8, CW + 8, 18).fill("#2a2a2a");
      this.doc.font(F.italic).fontSize(8).fillColor(C.soft);
      this.doc.text(this.sectionTitle + " (continued)", ML + 4, MT - 3, { width: CW - 8 });
      this.doc.rect(ML - 4, MT + 10, CW + 8, 1.5).fill(C.accent);
      this.y = MT + 22;
    }
  }

  advance(h: number) {
    this.y += h;
  }
}

// ─── Ornamental helpers ───────────────────────────────────────────────────────
function ornament(doc: PDFKit.PDFDocument, x: number, y: number, w: number) {
  const cx = x + w / 2;
  doc.moveTo(x, y).lineTo(cx - 8, y).strokeColor(C.rule).lineWidth(0.5).stroke();
  doc.circle(cx, y, 2).fillColor(C.accent).fill();
  doc.moveTo(cx + 8, y).lineTo(x + w, y).strokeColor(C.rule).lineWidth(0.5).stroke();
}

function thickRule(doc: PDFKit.PDFDocument, x: number, y: number, w: number) {
  doc.rect(x, y, w, 2).fill(C.ink);
  doc.rect(x, y + 4, w, 0.5).fill(C.rule);
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function houseManualPdfHandler(req: Request, res: Response) {
  try {
    const pages = await getGuestPages(1);
    const visible = pages.filter(p => {
      if (p.isVisible === false) return false;
      const content = (p.content ?? "").trim();
      if (!content) return false;
      // Filter out pages that have almost no printable content after stripping nav arrows
      const printableLines = content.split("\n").filter(l => {
        const t = l.trim();
        return t && !/^[→←►◄]/.test(t);
      });
      return printableLines.length >= 2;
    });

    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: MT, bottom: MB, left: ML, right: MR },
      info: { Title: "Vacation Rental Manager — House Manual", Author: "Vacation Rental Manager" },
      autoFirstPage: false,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="house-manual.pdf"');
    doc.pipe(res);

    const pm = new PageManager(doc);

    // ── COVER ──────────────────────────────────────────────────────────────────
    pm.startPage("Cover");
    doc.rect(0, 0, PW, PH).fill(C.cream);
    doc.rect(0, 0, PW, 265).fill(C.ink);
    doc.rect(0, 263, PW, 3).fill(C.accent);

    doc.font(F.bold).fontSize(9).fillColor(C.soft).fillOpacity(0.6);
    doc.text("Y O U R   P R O P E R T Y", ML, 50, { align: "center", width: CW, characterSpacing: 2 });
    doc.fillOpacity(1);
    doc.font(F.bold).fontSize(44).fillColor(C.white);
    doc.text("Vacation Rental", ML, 68, { align: "center", width: CW, characterSpacing: -1 });
    doc.font(F.italic).fontSize(17).fillColor(C.accent);
    doc.text("Your Property", ML, 120, { align: "center", width: CW, characterSpacing: 5 });
    ornament(doc, ML + 80, 162, CW - 160);
    doc.font(F.italic).fontSize(12).fillColor(C.soft);
    doc.text("House Manual & Guest Guide", ML, 174, { align: "center", width: CW });
    doc.font(F.sans).fontSize(7.5).fillColor(C.soft).fillOpacity(0.5);
    doc.text(`YOUR PROPERTY  ·  ${new Date().getFullYear()} EDITION`, ML, 224, { align: "center", width: CW, characterSpacing: 2 });
    doc.fillOpacity(1);

    let cy = 292;
    doc.rect(ML + 40, cy, CW - 80, 0.5).fill(C.rule);
    cy += 12;
    const wq = "Welcome to Vacation Rental. This guide covers everything you need for a comfortable and memorable stay at the property.";
    doc.font(F.italic).fontSize(12).fillColor(C.ink);
    doc.text(wq, ML + 40, cy, { align: "center", width: CW - 80, lineGap: 3 });
    const wqh = doc.heightOfString(wq, { width: CW - 80, lineGap: 3 });
    cy += wqh + 12;
    doc.rect(ML + 40, cy, CW - 80, 0.5).fill(C.rule);
    cy += 22;

    const infoItems: [string, string][] = [
      ["CHECK-IN", "4:00 PM"],
      ["CHECK-OUT", "11:00 AM"],
      ["ADDRESS", "Your Property"],
      ["EMERGENCY", "See Emergency page"],
    ];
    const icolW = CW / 2 - 16;
    for (let i = 0; i < infoItems.length; i++) {
      const ix = i % 2 === 0 ? ML + 10 : ML + CW / 2 + 6;
      if (i === 2) cy += 18;
      doc.font(F.sansB).fontSize(7).fillColor(C.accent);
      doc.text(infoItems[i][0], ix, cy, { width: icolW, characterSpacing: 1 });
      doc.font(F.serif).fontSize(10).fillColor(C.ink);
      doc.text(infoItems[i][1], ix, cy + 10, { width: icolW });
    }
    pm.footer();

    // ── TABLE OF CONTENTS ──────────────────────────────────────────────────────
    pm.startPage("Contents");
    doc.rect(0, 0, PW, PH).fill(C.cream);
    doc.rect(ML, MT - 22, CW, 2).fill(C.ink);
    doc.rect(ML, MT - 18, CW, 0.5).fill(C.rule);
    thickRule(doc, ML, MT, CW);
    doc.font(F.bold).fontSize(22).fillColor(C.ink);
    doc.text("CONTENTS", ML, MT + 12, { align: "center", width: CW, characterSpacing: 5 });
    thickRule(doc, ML, MT + 38, CW);
    pm.y = MT + 56;

    let tocPg = 3;
    for (let i = 0; i < visible.length; i++) {
      const pg = visible[i];
      pm.ensureSpace(18);
      if (i % 2 === 0) doc.rect(ML - 2, pm.y - 1, CW + 4, 17).fill("#f0ece6");
      doc.font(F.serif).fontSize(9.5).fillColor(C.ink);
      doc.text(`${i + 1}.`, ML, pm.y, { width: 18 });
      doc.text(pg.title, ML + 20, pm.y, { width: CW - 40 });
      doc.font(F.italic).fontSize(9).fillColor(C.mid);
      doc.text(`${tocPg}`, ML + CW - 18, pm.y, { width: 18, align: "right" });
      pm.advance(18);
      tocPg++;
    }
    pm.footer();

    // ── CONTENT PAGES ──────────────────────────────────────────────────────────
    for (const pg of visible) {
      // Pre-parse to check if there's meaningful content
      const tokens = parse(pg.content ?? "");
      const meaningfulTokens = tokens.filter(t => t.t !== "blank" && t.t !== "hr");
      if (meaningfulTokens.length === 0) continue; // skip empty pages

      pm.startPage(pg.title);
      doc.rect(0, 0, PW, PH).fill(C.cream);
      doc.rect(ML, MT - 22, CW, 2).fill(C.ink);
      doc.rect(ML, MT - 18, CW, 0.5).fill(C.rule);

      // Section header
      thickRule(doc, ML, MT, CW);
      doc.font(F.bold).fontSize(18).fillColor(C.ink);
      doc.text(pg.title.toUpperCase(), ML, MT + 10, { align: "center", width: CW, characterSpacing: 2 });
      ornament(doc, ML + 60, MT + 36, CW - 120);
      pm.y = MT + 50;

      for (const tok of tokens) {
        if (tok.t === "blank") {
          pm.advance(5);
          continue;
        }

        if (tok.t === "hr") {
          pm.ensureSpace(14);
          ornament(doc, ML + 80, pm.y + 5, CW - 160);
          pm.advance(14);
          continue;
        }

        if (tok.t === "h1") {
          pm.ensureSpace(26);
          pm.advance(6);
          doc.font(F.bold).fontSize(15).fillColor(C.ink);
          const h = doc.heightOfString(tok.text!, { width: CW });
          doc.text(tok.text!, ML, pm.y, { width: CW });
          doc.rect(ML, pm.y + h + 2, CW, 1).fill(C.accent);
          pm.advance(h + 10);
          continue;
        }

        if (tok.t === "h2") {
          pm.ensureSpace(22);
          pm.advance(4);
          doc.font(F.bold).fontSize(12).fillColor(C.ink);
          const h = doc.heightOfString(tok.text!, { width: CW });
          doc.text(tok.text!, ML, pm.y, { width: CW });
          doc.rect(ML, pm.y + h + 1, CW, 0.5).fill(C.accent);
          pm.advance(h + 8);
          continue;
        }

        if (tok.t === "h3") {
          pm.ensureSpace(16);
          pm.advance(3);
          doc.font(F.sansB).fontSize(8.5).fillColor(C.accent);
          const h = doc.heightOfString(tok.text!.toUpperCase(), { width: CW, characterSpacing: 1 });
          doc.text(tok.text!.toUpperCase(), ML, pm.y, { width: CW, characterSpacing: 1 });
          pm.advance(h + 5);
          continue;
        }

        if (tok.t === "bullet") {
          const ind = 8 + (tok.level ?? 0) * 12;
          const bw = CW - ind - 14;
          doc.font(F.serif).fontSize(10).fillColor(C.ink);
          const h = doc.heightOfString(tok.text!, { width: bw, lineGap: 1 });
          pm.ensureSpace(Math.max(h + 3, 14));
          doc.text((tok.level ?? 0) === 0 ? "•" : "◦", ML + ind, pm.y, { width: 12 });
          doc.text(tok.text!, ML + ind + 14, pm.y, { width: bw, lineGap: 1 });
          pm.advance(Math.max(h + 3, 14));
          continue;
        }

        if (tok.t === "p") {
          doc.font(F.serif).fontSize(10).fillColor(C.ink);
          const h = doc.heightOfString(tok.text!, { width: CW, lineGap: 2 });
          pm.ensureSpace(h + 5);
          doc.text(tok.text!, ML, pm.y, { width: CW, lineGap: 2 });
          pm.advance(h + 5);
          continue;
        }
      }

      pm.footer();
    }

    // ── BACK COVER ─────────────────────────────────────────────────────────────
    pm.startPage("Back Cover");
    doc.rect(0, 0, PW, PH).fill(C.ink);
    doc.rect(0, PH / 2 - 2, PW, 4).fill(C.accent);
    doc.font(F.bold).fontSize(26).fillColor(C.white);
    doc.text("VACATION RENTAL MANAGER", ML, PH / 2 - 64, { align: "center", width: CW, characterSpacing: 3 });
    ornament(doc, ML + 80, PH / 2 - 18, CW - 160);
    doc.font(F.italic).fontSize(12).fillColor(C.soft);
    doc.text("Your Property", ML, PH / 2 + 20, { align: "center", width: CW });
    doc.font(F.serif).fontSize(9).fillColor(C.mid);
    doc.text("Thank you for staying with us.", ML, PH / 2 + 44, { align: "center", width: CW });

    doc.end();
  } catch (error) {
    console.error("[House Manual PDF] Error:", error);
    if (!res.headersSent) res.status(500).send("Error generating PDF");
  }
}
