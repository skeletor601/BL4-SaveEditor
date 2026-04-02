import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { getManifest, getAllParts, searchParts, getPartByCode, getPartsByCodes } from "../data/parts.js";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadNpcParts(): unknown[] {
  const paths = [
    join(__dirname, "../../../master_search/db/npc_parts_db.json"),
    join(__dirname, "../../data/npc_parts_db.json"),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, "utf-8"));
      return (data?.rows ?? data?.items ?? []) as unknown[];
    } catch { /* skip */ }
  }
  return [];
}

export async function partsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  fastify.get("/manifest", async (_request, reply) => {
    const manifest = getManifest();
    return reply.send(manifest);
  });

  /** Full dataset for client-side search/filter. No pagination. */
  fastify.get("/data", async (_request, reply) => {
    const items = getAllParts();
    return reply.send({ items });
  });

  /** Look up one part by code (e.g. {291:1}). For item/weapon edit fallback when CSV has no row. */
  fastify.get<{ Querystring: { code?: string } }>("/lookup", async (request, reply) => {
    const code = (request.query.code ?? "").trim();
    if (!code) return reply.code(400).send({ error: "Missing code" });
    const part = getPartByCode(code);
    return reply.send(part ?? null);
  });

  /** Look up multiple parts by code. Body: { codes: string[] }. Returns { [code]: PartItem | null }. */
  fastify.post<{ Body: { codes?: string[] } }>("/lookup-bulk", async (request, reply) => {
    const codes = Array.isArray(request.body?.codes) ? request.body.codes : [];
    const result = getPartsByCodes(codes);
    return reply.send(result);
  });

  fastify.get<{
    Querystring: { q?: string; category?: string; limit?: string };
  }>("/search", async (request, reply) => {
    const q = request.query.q ?? "";
    const category = request.query.category;
    const limit = Math.min(Number(request.query.limit) || 10000, 50000);
    const items = searchParts(q, category, limit);
    return reply.send({ items });
  });

  /** NPC weapons database — turrets, NPC character guns, action skill weapons */
  fastify.get("/npc", async (_request, reply) => {
    const items = loadNpcParts();
    return reply.send({ items });
  });

  /** DLC codes — set of codes that are DLC-only, keyed by content pack name */
  fastify.get("/dlc-codes", async (_request, reply) => {
    const dlcPath = join(__dirname, "../../data/dlc_codes.json");
    if (!existsSync(dlcPath)) return reply.send({});
    try {
      const data = JSON.parse(readFileSync(dlcPath, "utf-8"));
      return reply.send(data);
    } catch {
      return reply.send({});
    }
  });
}
