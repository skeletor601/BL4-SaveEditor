import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");

export interface VersionInfo {
  version: string;
  changelog?: string;
  downloadUrl?: string;
}

const defaultVersion: VersionInfo = {
  version: process.env.APP_VERSION || "3.69.0",
  changelog: "Web port v1. See README.",
  downloadUrl: "https://github.com/skeletor601/BL4-SaveEditor/releases",
};

export function getVersionInfo(): VersionInfo {
  const path = join(root, "data", "version_info.txt");
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, "utf-8");
      const versionMatch = raw.match(/FileVersion.*?(\d+\.\d+\.\d+)/);
      const version = versionMatch ? versionMatch[1] : defaultVersion.version;
      return { ...defaultVersion, version };
    } catch {
      return defaultVersion;
    }
  }
  return defaultVersion;
}
