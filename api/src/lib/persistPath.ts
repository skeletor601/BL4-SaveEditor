/**
 * Persistent data path — uses Render's persistent disk (/data/) in production,
 * falls back to api/data/ locally.
 */
import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Render persistent disk mount path
const RENDER_DISK = "/data";
const LOCAL_DATA = join(__dirname, "../../data");

const useRenderDisk = existsSync(RENDER_DISK);

if (useRenderDisk) {
  console.log("[persist] Using Render persistent disk at /data");
} else {
  console.log("[persist] Using local api/data/");
}

export function persistPath(filename: string): string {
  const dir = useRenderDisk ? RENDER_DISK : LOCAL_DATA;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, filename);
}
