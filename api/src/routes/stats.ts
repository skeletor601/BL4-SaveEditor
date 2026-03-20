/**
 * Site stats — visitor counter, weapons generated, grenades generated.
 * Simple flat file counter. Increments on each visit/generate.
 */
import { FastifyInstance } from "fastify";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATS_PATH = join(__dirname, "../../data/site_stats.json");

interface SiteStats {
  totalVisits: number;
  uniqueVisitors: number;
  weaponsGenerated: number;
  grenadesGenerated: number;
  codesValidated: number;
  lastReset: string;
  visitorIps: string[];
}

function loadStats(): SiteStats {
  try {
    if (!existsSync(STATS_PATH)) return defaultStats();
    return JSON.parse(readFileSync(STATS_PATH, "utf-8"));
  } catch {
    return defaultStats();
  }
}

function defaultStats(): SiteStats {
  return {
    totalVisits: 0,
    uniqueVisitors: 0,
    weaponsGenerated: 0,
    grenadesGenerated: 0,
    codesValidated: 0,
    lastReset: new Date().toISOString(),
    visitorIps: [],
  };
}

function saveStats(stats: SiteStats): void {
  writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2), "utf-8");
}

// Hash IP for privacy — don't store raw IPs
function hashIp(ip: string): string {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const chr = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `v${Math.abs(hash).toString(36)}`;
}

export async function statsRoutes(fastify: FastifyInstance, _opts: unknown) {
  // GET public stats (no IPs exposed)
  fastify.get("/stats", async (_request, reply) => {
    const stats = loadStats();
    reply.send({
      totalVisits: stats.totalVisits,
      uniqueVisitors: stats.uniqueVisitors,
      weaponsGenerated: stats.weaponsGenerated,
      grenadesGenerated: stats.grenadesGenerated,
      codesValidated: stats.codesValidated,
      since: stats.lastReset,
    });
  });

  // POST increment a counter
  fastify.post("/stats/visit", async (request, reply) => {
    const stats = loadStats();
    stats.totalVisits += 1;
    const hashed = hashIp(request.ip);
    if (!stats.visitorIps.includes(hashed)) {
      stats.visitorIps.push(hashed);
      stats.uniqueVisitors = stats.visitorIps.length;
    }
    saveStats(stats);
    reply.send({ totalVisits: stats.totalVisits, uniqueVisitors: stats.uniqueVisitors });
  });

  fastify.post("/stats/weapon-generated", async (_request, reply) => {
    const stats = loadStats();
    stats.weaponsGenerated += 1;
    saveStats(stats);
    reply.send({ weaponsGenerated: stats.weaponsGenerated });
  });

  fastify.post("/stats/grenade-generated", async (_request, reply) => {
    const stats = loadStats();
    stats.grenadesGenerated += 1;
    saveStats(stats);
    reply.send({ grenadesGenerated: stats.grenadesGenerated });
  });

  fastify.post("/stats/code-validated", async (_request, reply) => {
    const stats = loadStats();
    stats.codesValidated += 1;
    saveStats(stats);
    reply.send({ codesValidated: stats.codesValidated });
  });
}
