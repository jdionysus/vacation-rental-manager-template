import { Request, Response } from "express";
import PDFDocument from "pdfkit";
import { getChecklistTemplates } from "./db-extra";
import { getProperty } from "./db";

/**
 * Generates a printable PDF for a checklist template.
 * GET /api/checklist/pdf/:id
 */
export async function checklistPdfHandler(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).send("Invalid template ID");
      return;
    }

    const [templates, property] = await Promise.all([getChecklistTemplates(1), getProperty(1)]);
    const template = templates.find(t => t.id === id);

    if (!template) {
      res.status(404).send("Template not found");
      return;
    }

    const items = Array.isArray(template.items) ? template.items : [];
    const propertyName = property?.name || "Vacation Rental";

    // Group items by section
    const sections: Record<string, { item: string; required: boolean }[]> = {};
    for (const item of items) {
      if (!item.item?.trim()) continue;
      const section = item.section || "General";
      if (!sections[section]) sections[section] = [];
      sections[section].push({ item: item.item, required: item.required ?? false });
    }

    // Create PDF
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 54, bottom: 54, left: 54, right: 54 },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="checklist-${template.name.toLowerCase().replace(/\s+/g, "-")}.pdf"`
    );
    doc.pipe(res);

    const PAGE_W = 612;
    const MARGIN = 54;
    const CONTENT_W = PAGE_W - 2 * MARGIN;
    const INK = "#111111";
    const MID = "#6f6f6f";
    const SOFT = "#d5d5d5";

    // ── Header ──────────────────────────────────────────────────────────────
    doc.font("Times-Bold").fontSize(20).fillColor(INK);
    doc.text(propertyName.toUpperCase(), MARGIN, MARGIN, { align: "center", width: CONTENT_W });

    doc.moveTo(MARGIN + CONTENT_W / 2 - 54, MARGIN + 28)
       .lineTo(MARGIN + CONTENT_W / 2 - 6, MARGIN + 28)
       .strokeColor(SOFT).lineWidth(0.5).stroke();
    doc.circle(MARGIN + CONTENT_W / 2, MARGIN + 28, 3).fillColor(MID).fill();
    doc.moveTo(MARGIN + CONTENT_W / 2 + 6, MARGIN + 28)
       .lineTo(MARGIN + CONTENT_W / 2 + 54, MARGIN + 28)
       .strokeColor(SOFT).lineWidth(0.5).stroke();

    doc.font("Times-Italic").fontSize(10).fillColor(MID);
    doc.text("Property Checklist", MARGIN, MARGIN + 36, { align: "center", width: CONTENT_W });

    // Horizontal rule
    doc.moveTo(MARGIN, MARGIN + 56).lineTo(MARGIN + CONTENT_W, MARGIN + 56)
       .strokeColor(SOFT).lineWidth(0.5).stroke();

    // ── Template title ───────────────────────────────────────────────────────
    let y = MARGIN + 72;

    doc.font("Times-Bold").fontSize(15).fillColor(INK);
    doc.text(template.name.toUpperCase(), MARGIN, y, { align: "center", width: CONTENT_W });
    y += 22;

    const taskTypeLabel = {
      turnover: "Turnover Cleaning",
      maintenance: "Maintenance",
      inspection: "Inspection",
      other: "General",
    }[template.taskType] ?? template.taskType;

    doc.font("Times-Italic").fontSize(9.5).fillColor(MID);
    doc.text(taskTypeLabel, MARGIN, y, { align: "center", width: CONTENT_W });
    y += 14;

    // Date / Name line
    doc.font("Times-Roman").fontSize(9).fillColor(MID);
    doc.text("Date: ___________________    Completed by: ___________________________", MARGIN, y, {
      align: "center",
      width: CONTENT_W,
    });
    y += 20;

    // Rule
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y)
       .strokeColor(SOFT).lineWidth(0.5).stroke();
    y += 16;

    // ── Sections & items ─────────────────────────────────────────────────────
    const sectionNames = Object.keys(sections);

    for (const section of sectionNames) {
      const sectionItems = sections[section];

      // Section header
      doc.font("Times-Bold").fontSize(10).fillColor(INK);
      doc.text(section.toUpperCase(), MARGIN, y, { width: CONTENT_W });
      y += 16;

      // Items with checkboxes
      for (const { item, required } of sectionItems) {
        // Check if we need a new page
        if (y > 720) {
          doc.addPage();
          y = MARGIN;
        }

        // Checkbox square
        doc.rect(MARGIN, y + 1, 9, 9).strokeColor(INK).lineWidth(0.6).stroke();

        // Required star
        if (required) {
          doc.font("Times-Bold").fontSize(8).fillColor("#cc3333");
          doc.text("*", MARGIN + 12, y + 1);
        }

        // Item text
        doc.font("Times-Roman").fontSize(9.5).fillColor(INK);
        const itemX = MARGIN + (required ? 22 : 16);
        doc.text(item, itemX, y, { width: CONTENT_W - (itemX - MARGIN) });
        const textHeight = doc.heightOfString(item, { width: CONTENT_W - (itemX - MARGIN) });
        y += Math.max(textHeight + 4, 16);
      }

      y += 8; // space between sections
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const footerY = 756;
    doc.moveTo(MARGIN, footerY).lineTo(MARGIN + CONTENT_W, footerY)
       .strokeColor(SOFT).lineWidth(0.5).stroke();

    doc.font("Times-Italic").fontSize(8).fillColor(MID);
    doc.text(`${propertyName}  ·  * Required items`, MARGIN, footerY + 6, {
      align: "center",
      width: CONTENT_W,
    });

    doc.end();
  } catch (error) {
    console.error("[Checklist PDF] Error:", error);
    if (!res.headersSent) {
      res.status(500).send("Error generating PDF");
    }
  }
}
