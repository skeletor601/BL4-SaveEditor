/**
 * YouTube build extraction routes.
 * - POST /youtube/check-links — scrape page for planner links
 * - POST /youtube/build — extract build from transcript (fallback)
 */

import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
const scriptsDir = join(repoRoot, "scripts");

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/v\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * Run a Python script and return its JSON output.
 */
function runPython(scriptPath: string, args: string[], timeoutMs = 30000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [scriptPath, ...args], {
      cwd: repoRoot,
      timeout: timeoutMs,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.slice(-500) || `Python exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Invalid JSON from Python: " + stdout.slice(0, 300)));
      }
    });
    proc.on("error", reject);
  });
}

export async function youtubeRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  /**
   * POST /youtube/check-links
   * Body: { url: string }
   * Returns: { title, plannerLinks, hasTranscript }
   */
  fastify.post<{ Body: { url?: string } }>("/youtube/check-links", async (request, reply) => {
    const url = (request.body as { url?: string })?.url;
    if (!url || typeof url !== "string") {
      return reply.code(400).send({ error: "url is required" });
    }
    const videoId = extractVideoId(url);
    if (!videoId) {
      return reply.code(400).send({ error: "Invalid YouTube URL" });
    }
    try {
      const result = await runPython(
        join(scriptsDir, "yt_check_links.py"),
        [videoId],
      );
      return reply.send(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      fastify.log.warn({ err: e }, "youtube/check-links failed");
      return reply.code(400).send({ error: msg });
    }
  });

  /**
   * POST /youtube/build
   * Body: { url: string, level?: number }
   * Returns: AssembledBuild-like response from transcript extraction
   */
  fastify.post<{ Body: { url?: string; level?: number } }>("/youtube/build", async (request, reply) => {
    const { url, level } = (request.body as { url?: string; level?: number }) ?? {};
    if (!url || typeof url !== "string") {
      return reply.code(400).send({ error: "url is required" });
    }
    const videoId = extractVideoId(url);
    if (!videoId) {
      return reply.code(400).send({ error: "Invalid YouTube URL" });
    }
    try {
      const result = await runPython(
        join(scriptsDir, "yt_build_extract.py"),
        [videoId, String(level ?? 60)],
        45000,
      );
      return reply.send(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      fastify.log.warn({ err: e }, "youtube/build failed");
      return reply.code(400).send({ error: msg });
    }
  });
}
