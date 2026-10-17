import { describe, expect, it } from "vitest";
import { HTML_DOCUMENT_CACHE_CONTROL, applyHtmlDocumentCacheHeaders } from "./_core/vite";

describe("production HTML cache control", () => {
  it("prevents browsers from retaining an outdated application shell after deployment", () => {
    const headers = new Map<string, string>();
    applyHtmlDocumentCacheHeaders({
      setHeader: (name, value) => headers.set(name, value),
    });

    expect(HTML_DOCUMENT_CACHE_CONTROL).toBe("no-store, max-age=0, must-revalidate");
    expect(headers.get("Cache-Control")).toBe(HTML_DOCUMENT_CACHE_CONTROL);
  });
});
