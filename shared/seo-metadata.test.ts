import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(currentDirectory, "../client/index.html"), "utf8");
describe("public landing-page SEO metadata", () => {
  it("uses generic template metadata", () => {
    expect(indexHtml).toContain("Vacation Rental Manager");
    expect(indexHtml).toContain('name="robots"');
  });
});
