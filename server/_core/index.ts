import "dotenv/config";
import express from "express";
import { createServer } from "http";
import * as fs from "node:fs";
import net from "net";
import * as path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerStripeWebhook } from "../stripe-webhook";
import { autoTasksHandler } from "../auto-tasks";
import { icalExportHandler } from "../ical-export";
import { checklistPdfHandler } from "../checklist-pdf";
import { houseManualPdfHandler } from "../house-manual-pdf";
import { portalQrPdfHandler } from "../portal-qr-pdf";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1); // Trust proxy headers so req.protocol = 'https' in production
  const server = createServer(app);

  // ─── Security headers (helmet) ──────────────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false, // Vite injects inline scripts; CSP managed at CF level
    crossOriginEmbedderPolicy: false,
  }));

  // ─── Rate limiting ───────────────────────────────────────────────────────────────────────────
  // Strict limit on public write endpoints (guestbook, feedback, issues, code verify)
  const publicWriteLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 requests per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    skip: (req) => req.path.startsWith('/api/trpc/auth') || req.path.includes('export.ics'),
  });
  // Apply to all tRPC mutations that are public-facing write operations
  app.use('/api/trpc/guestbook.submit', publicWriteLimit);
  app.use('/api/trpc/feedback.submit', publicWriteLimit);
  app.use('/api/trpc/issues.report', publicWriteLimit);
  app.use('/api/trpc/bypassCodes.verify', publicWriteLimit);
  app.use('/api/trpc/guest.verifyCode', publicWriteLimit);
  app.use('/api/trpc/cleaner.verifyCode', publicWriteLimit);
  // General API rate limit (generous, for normal usage)
  const apiLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 300, // 300 req/min per IP
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !req.path.startsWith('/api/'),
  });
  app.use(apiLimit);

  // Register Stripe webhook BEFORE json body parser (needs raw body)
  registerStripeWebhook(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Scheduled endpoints (must be before tRPC)
  app.post("/api/scheduled/auto-tasks", autoTasksHandler);
  // iCal export feed (public, no auth required)
  app.get("/api/calendar/export.ics", icalExportHandler);
  // Checklist PDF download (host-only but no session check needed — ID is opaque)
  app.get("/api/checklist/pdf/:id", checklistPdfHandler);
  // House Manual PDF — dynamic PDF from all guest portal pages
  app.get("/api/house-manual/pdf", houseManualPdfHandler);
  // Portal QR code PDFs — 5x7" printable QR cards
  app.get("/api/qr/:portal", portalQrPdfHandler);
  app.get("/api/portal-qr/:portal", portalQrPdfHandler); // legacy alias
  // Static print materials — served from server/print-assets/
  const servePrintFile = (req: any, res: any) => {
    // Sanitize: strip extension, allow only safe chars, force .pdf extension
    const rawName = req.params.file.replace(/\.pdf$/i, '').replace(/[^a-z0-9_-]/gi, '');
    const file = rawName + '.pdf';
    const assetDirectories = [
      path.join(process.cwd(), 'dist', 'print-assets'),
      path.join(process.cwd(), 'server', 'print-assets'),
    ];
    const filePath = assetDirectories
      .map(directory => path.join(directory, file))
      .find(candidate => fs.existsSync(candidate));
    if (!filePath) return res.status(404).send('Not found');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    fs.createReadStream(filePath).pipe(res);
  };
  app.get("/api/files/:file", servePrintFile);
  app.get("/api/print/:file", servePrintFile); // legacy alias
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
