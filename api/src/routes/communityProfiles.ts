/**
 * Community Profiles — seed + display name registration.
 * Stored in persistent JSON on Render disk.
 */
import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { readFileSync, writeFileSync, existsSync } from "fs";

import { persistPath } from "../lib/persistPath.js";
const PROFILES_PATH = persistPath("community_profiles.json");

export interface CommunityProfile {
  seed: number;
  name: string;
  registeredAt: number;
}

function loadProfiles(): CommunityProfile[] {
  if (!existsSync(PROFILES_PATH)) return [];
  try {
    return JSON.parse(readFileSync(PROFILES_PATH, "utf-8")) as CommunityProfile[];
  } catch {
    return [];
  }
}

function saveProfiles(profiles: CommunityProfile[]): void {
  writeFileSync(PROFILES_PATH, JSON.stringify(profiles, null, 2), "utf-8");
}

export function lookupProfileBySeed(seed: number): CommunityProfile | undefined {
  const profiles = loadProfiles();
  return profiles.find((p) => p.seed === seed);
}

export async function communityProfileRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /api/community/profiles — all registered profiles
  fastify.get("/community/profiles", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ success: true, profiles: loadProfiles() });
  });

  // POST /api/community/profiles — register or update a profile
  fastify.post("/community/profiles", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    const { seed, name } = body ?? {};

    if (typeof seed !== "number" || !Number.isFinite(seed) || seed < 1 || seed > 9999) {
      return reply.code(400).send({ error: "seed must be a number 1-9999" });
    }
    if (typeof name !== "string" || !name.trim() || name.trim().length > 30) {
      return reply.code(400).send({ error: "name is required (max 30 chars)" });
    }

    const profiles = loadProfiles();
    const existing = profiles.find((p) => p.seed === seed);
    if (existing) {
      existing.name = name.trim();
      existing.registeredAt = Date.now();
    } else {
      if (profiles.length >= 500) {
        return reply.code(400).send({ error: "Max profiles reached" });
      }
      profiles.push({ seed: Math.trunc(seed), name: name.trim(), registeredAt: Date.now() });
    }
    saveProfiles(profiles);
    return reply.code(201).send({ success: true });
  });
}
