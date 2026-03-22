/**
 * Community God Rolls — user-submitted non-modded god roll codes.
 * Built-in god rolls come from /godrolls.json (repo root).
 * User submissions stored on Render persistent disk.
 */
import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

import { persistPath } from "../lib/persistPath.js";
const COMMUNITY_GODROLLS_PATH = persistPath("community_godrolls.json");

// In-memory rate limit: max 5 submissions per IP per hour
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const ipSubmissions = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const rec = ipSubmissions.get(ip);
  if (!rec || now - rec.windowStart > RATE_WINDOW_MS) {
    ipSubmissions.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (rec.count >= RATE_LIMIT) return false;
  rec.count++;
  return true;
}

export interface CommunityGodRoll {
  id: string;
  name: string;
  decoded: string;
  description?: string;
  submittedAt: number;
  upvotes: number;
  seed?: number;
  authorName?: string;
  source: "builtin" | "community";
}

interface BuiltinGodRoll {
  name: string;
  decoded: string;
}

function loadCommunityGodrolls(): CommunityGodRoll[] {
  if (!existsSync(COMMUNITY_GODROLLS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(COMMUNITY_GODROLLS_PATH, "utf-8")) as CommunityGodRoll[];
  } catch {
    return [];
  }
}

function saveCommunityGodrolls(godrolls: CommunityGodRoll[]): void {
  writeFileSync(COMMUNITY_GODROLLS_PATH, JSON.stringify(godrolls, null, 2), "utf-8");
}

function loadBuiltinGodrolls(): BuiltinGodRoll[] {
  // Search same paths as weaponGen.ts loadGodrolls() + parent dir (api/ runs from api/)
  const candidates = [
    join(process.cwd(), "godrolls.json"),
    join(process.cwd(), "..", "godrolls.json"),
    join(process.cwd(), "data", "godrolls.json"),
    join(process.cwd(), "web", "public", "data", "godrolls.json"),
    join(process.cwd(), "..", "web", "public", "data", "godrolls.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, "utf-8"));
        if (Array.isArray(raw)) return raw.filter((r: unknown) => {
          const obj = r as Record<string, unknown>;
          return typeof obj.name === "string" && typeof obj.decoded === "string";
        });
      } catch { /* next */ }
    }
  }
  return [];
}

export async function communityGodrollRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /api/community/godrolls — returns builtin + community god rolls merged
  fastify.get("/community/godrolls", async (_request: FastifyRequest, reply: FastifyReply) => {
    const builtin = loadBuiltinGodrolls().map((g, i) => ({
      id: `builtin-${i}`,
      name: g.name,
      decoded: g.decoded,
      submittedAt: 0,
      upvotes: 0,
      source: "builtin" as const,
    }));
    const community = loadCommunityGodrolls();

    // Enrich community entries with profile names
    let profiles: Array<{ seed: number; name: string }> = [];
    try {
      const { lookupProfileBySeed } = await import("./communityProfiles.js");
      const enriched = community.map((r) => {
        if (r.seed && !r.authorName) {
          const profile = lookupProfileBySeed(r.seed);
          if (profile) return { ...r, authorName: profile.name };
        }
        return r;
      });
      return reply.send({
        success: true,
        godrolls: [...enriched.sort((a, b) => b.upvotes - a.upvotes || b.submittedAt - a.submittedAt), ...builtin],
      });
    } catch {
      return reply.send({
        success: true,
        godrolls: [...community.sort((a, b) => b.upvotes - a.upvotes || b.submittedAt - a.submittedAt), ...builtin],
      });
    }
  });

  // POST /api/community/godrolls — submit a new god roll
  fastify.post("/community/godrolls", async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = request.ip ?? "unknown";
    if (!checkRateLimit(ip)) {
      return reply.code(429).send({ error: "Rate limit exceeded. Try again later." });
    }

    const body = request.body as Record<string, unknown>;
    const { name, decoded, description, seed } = body ?? {};

    if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
      return reply.code(400).send({ error: "name is required (max 100 chars)" });
    }
    if (typeof decoded !== "string" || !decoded.trim()) {
      return reply.code(400).send({ error: "decoded string is required" });
    }

    const godrolls = loadCommunityGodrolls();
    const newEntry: CommunityGodRoll = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim().slice(0, 100),
      decoded: decoded.trim().slice(0, 2000),
      description: typeof description === "string" ? description.trim().slice(0, 500) : undefined,
      submittedAt: Date.now(),
      upvotes: 0,
      seed: typeof seed === "number" && Number.isFinite(seed) && seed >= 1 && seed <= 9999 ? Math.trunc(seed) : undefined,
      source: "community",
    };

    godrolls.unshift(newEntry);
    if (godrolls.length > 500) godrolls.splice(500);
    saveCommunityGodrolls(godrolls);

    return reply.code(201).send({ success: true, godroll: newEntry });
  });

  // POST /api/community/godrolls/:id/upvote — upvote a god roll
  fastify.post("/community/godrolls/:id/upvote", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const godrolls = loadCommunityGodrolls();
    const entry = godrolls.find((r) => r.id === id);
    if (!entry) return reply.code(404).send({ error: "God roll not found" });
    entry.upvotes++;
    saveCommunityGodrolls(godrolls);
    return reply.send({ success: true, upvotes: entry.upvotes });
  });
}
