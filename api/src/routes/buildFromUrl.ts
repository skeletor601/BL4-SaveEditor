import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  scrapeMobalyticsBuild,
  resolveItems,
  assembleBuild,
} from "../data/buildFromUrl.js";
import type { ResolvedItem, MobaGearSlot, BuildContext } from "../data/buildFromUrl.js";

export async function buildFromUrlRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  /**
   * POST /build-from-url/scrape
   * Body: { url: string }
   * Returns variants with gear, firmware, skills, context from text.
   */
  fastify.post<{ Body: { url: string } }>(
    "/build-from-url/scrape",
    async (request, reply) => {
      try {
        const { url } = request.body ?? {};
        if (!url || typeof url !== "string") {
          return reply.code(400).send({ error: "url is required" });
        }

        const scraped = await scrapeMobalyticsBuild(url.trim());

        // Pre-resolve items for the first variant
        const firstVariant = scraped.variants[0];
        const resolved = firstVariant ? resolveItems(firstVariant.gear) : [];

        return reply.send({
          buildName: scraped.buildName,
          character: scraped.character,
          url: scraped.url,
          variants: scraped.variants,
          context: scraped.context,
          resolved,
          rawSlotCount: scraped.rawSlotCount,
        });
      } catch (e: any) {
        fastify.log.error(e);
        return reply.code(500).send({ error: e.message || "Scrape failed" });
      }
    },
  );

  /**
   * POST /build-from-url/resolve
   * Body: { gear: MobaGearSlot[] }
   * Resolve a specific variant's gear against the DB.
   */
  fastify.post<{ Body: { gear: MobaGearSlot[] } }>(
    "/build-from-url/resolve",
    async (request, reply) => {
      try {
        const { gear } = request.body ?? {};
        if (!gear || !Array.isArray(gear)) {
          return reply.code(400).send({ error: "gear array is required" });
        }
        return reply.send({ resolved: resolveItems(gear) });
      } catch (e: any) {
        fastify.log.error(e);
        return reply.code(500).send({ error: e.message || "Resolve failed" });
      }
    },
  );

  /**
   * POST /build-from-url/assemble
   * Body: { buildName, character, variantName, resolved, context, firmware, level }
   */
  fastify.post<{
    Body: {
      buildName: string;
      character: string;
      variantName: string;
      resolved: ResolvedItem[];
      context: BuildContext;
      firmware: MobaGearSlot[];
      level?: number;
    };
  }>("/build-from-url/assemble", async (request, reply) => {
    try {
      const { buildName, character, variantName, resolved, context, firmware, level } =
        request.body ?? {};
      if (!resolved || !Array.isArray(resolved)) {
        return reply.code(400).send({ error: "resolved array is required" });
      }

      const build = assembleBuild(
        buildName || "Unnamed Build",
        character || "",
        variantName || "",
        resolved,
        context || { weaponHints: { allElements: false, dominantElement: null, manufacturerParts: [], underbarrel: null, perWeapon: {} }, classModSkills: [], enhancementStats: [], enhancementPerks: [], ordnanceHint: null, firmwareHint: null, textDerivedGear: [], equipmentText: "", firmwareText: "" },
        firmware || [],
        level ?? 60,
      );

      return reply.send(build);
    } catch (e: any) {
      fastify.log.error(e);
      return reply.code(500).send({ error: e.message || "Assembly failed" });
    }
  });
}
