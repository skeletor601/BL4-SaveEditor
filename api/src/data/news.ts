import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");

const defaultNews = `Change themes top right, next to Credits Button.

Welcome to the BL4 AIO Save Editor Web. If you have any problems or need help, message on Discord.
Repo: https://github.com/skeletor601/BL4-SaveEditor`;

export function getNews(): string {
  const path = join(root, "data", "news.txt");
  if (existsSync(path)) {
    try {
      return readFileSync(path, "utf-8").trim();
    } catch {
      return defaultNews;
    }
  }
  return process.env.NEWS_CONTENT || defaultNews;
}
