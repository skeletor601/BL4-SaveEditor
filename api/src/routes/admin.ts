import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { setPartsData } from "../data/parts.js";
import type { PartItem } from "../data/parts.js";

export async function adminRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  fastify.post<{
    Body: { secret?: string; items?: PartItem[] };
  }>("/update", async (request, reply) => {
    const adminSecret = process.env.ADMIN_SECRET;
    if (adminSecret && adminSecret.length > 0) {
      const secret = request.body?.secret;
      if (secret !== adminSecret) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
    }

    const sourceUrl = process.env.PARTS_SOURCE_URL;
    if (sourceUrl) {
      // TODO: fetch from PARTS_SOURCE_URL (ZIP or JSON), extract, validate, then setPartsData
      fastify.log.info({ url: sourceUrl }, "Parts source URL configured; full fetch not implemented yet");
    }

    const items = request.body?.items;
    if (Array.isArray(items) && items.length > 0) {
      setPartsData(items);
      return reply.send({ ok: true, count: items.length });
    }

    return reply.send({ ok: true, message: "No payload; use PARTS_SOURCE_URL or POST body items to update." });
  });
}
