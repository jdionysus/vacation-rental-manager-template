import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export const HTML_DOCUMENT_CACHE_CONTROL = "no-store, max-age=0, must-revalidate";

export function applyHtmlDocumentCacheHeaders(res: { setHeader: (name: string, value: string) => void }) {
  res.setHeader("Cache-Control", HTML_DOCUMENT_CACHE_CONTROL);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Serve build assets normally, but never let a browser retain an old HTML shell.
  // Vite fingerprints JavaScript/CSS assets on every build. A cached index.html can
  // therefore point a returning mobile browser at bundle files removed by a later deploy,
  // which leaves React with a blank page. `index: false` ensures HTML always reaches the
  // fallback below, where the response is explicitly non-cacheable.
  app.use(express.static(distPath, { index: false }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    applyHtmlDocumentCacheHeaders(res);
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
