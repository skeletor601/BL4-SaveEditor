import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { getManifest } from "../data/parts.js";
import { searchParts } from "../data/parts.js";

export async function partsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  fastify.get("/manifest", async (_request, reply) => {
    const manifest = getManifest();
    return reply.send(manifest);
  });

  fastify.get<{
    Querystring: { q?: string; category?: string; limit?: string };
  }>("/search", async (request, reply) => {
    const q = request.query.q ?? "";
    const category = request.query.category;
    const limit = Math.min(Number(request.query.limit) || 100, 500);
    const items = searchParts(q, category, limit);
    return reply.send({ items });
  });
}
