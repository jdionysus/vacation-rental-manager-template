import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
const sourceDirectory = path.resolve("server", "print-assets");
const destinationDirectory = path.resolve("dist", "print-assets");
await rm(destinationDirectory, { recursive: true, force: true });
try { await stat(sourceDirectory); await mkdir(destinationDirectory, { recursive: true }); await cp(sourceDirectory, destinationDirectory, { recursive: true }); } catch (error) { if (error && error.code !== "ENOENT") throw error; }
