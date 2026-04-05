/**
 * Maxroll scraper route — extracts build planner data from maxroll.gg URLs.
 */

import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { scrapeMaxroll } from "../data/maxrollScraper.js";
import { assembleMaxrollBuild } from "../data/buildFromUrl.js";

export async function maxrollRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.post<{ Body: { url?: string } }>("/maxroll/scrape", async (request, reply) => {
    const url = (request.body as { url?: string })?.url;
    if (!url || typeof url !== "string") {
      return reply.code(400).send({ error: "url is required" });
    }
    try {
      const result = await scrapeMaxroll(url);
      return reply.send(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Scrape failed";
      fastify.log.warn({ err: e }, "maxroll/scrape failed");
      return reply.code(400).send({ error: message });
    }
  });

  /** POST /maxroll/assemble — scrape + assemble in one shot */
  fastify.post<{ Body: { url?: string; level?: number } }>("/maxroll/assemble", async (request, reply) => {
    const { url, level } = (request.body as { url?: string; level?: number }) ?? {};
    if (!url || typeof url !== "string") {
      return reply.code(400).send({ error: "url is required" });
    }
    try {
      const scraped = await scrapeMaxroll(url.trim());
      const equipment = scraped.equipment.map((e: { slot: string; item: { type: string; customAttr: Record<string, unknown> } }) => ({
        slot: e.slot,
        item: e.item as { type: string; customAttr: Record<string, unknown> },
      }));
      const build = assembleMaxrollBuild(
        scraped.plannerName,
        scraped.character,
        equipment,
        level ?? 60,
      );
      return reply.send({ ...build, skills: scraped.skills, specializations: scraped.specializations });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Assembly failed";
      fastify.log.warn({ err: e }, "maxroll/assemble failed");
      return reply.code(400).send({ error: message });
    }
  });
}
