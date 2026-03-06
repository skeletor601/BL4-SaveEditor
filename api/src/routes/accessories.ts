import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createReadStream, existsSync } from "fs";
import { getGrenadeBuilderData } from "../data/grenadeBuilder.js";
import { getRepkitBuilderData } from "../data/repkitBuilder.js";
import { getShieldBuilderData } from "../data/shieldBuilder.js";
import { getHeavyBuilderData } from "../data/heavyBuilder.js";
import { getClassModBuilderData } from "../data/classModBuilder.js";
import { getEnhancementBuilderData } from "../data/enhancementBuilder.js";

export async function accessoriesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  fastify.get("/accessories/grenade/builder-data", async (_request, reply) => {
    try {
      const data = getGrenadeBuilderData();
      return reply.send(data);
    } catch (e) {
      fastify.log.error(e);
      return reply.code(500).send({ error: "Failed to load grenade builder data" });
    }
  });

  fastify.get("/accessories/repkit/builder-data", async (_request, reply) => {
    try {
      const data = getRepkitBuilderData();
      return reply.send(data);
    } catch (e) {
      fastify.log.error(e);
      return reply.code(500).send({ error: "Failed to load repkit builder data" });
    }
  });

  fastify.get("/accessories/shield/builder-data", async (_request, reply) => {
    try {
      const data = getShieldBuilderData();
      return reply.send(data);
    } catch (e) {
      fastify.log.error(e);
      return reply.code(500).send({ error: "Failed to load shield builder data" });
    }
  });

  fastify.get("/accessories/heavy/builder-data", async (_request, reply) => {
    try {
      const data = getHeavyBuilderData();
      return reply.send(data);
    } catch (e) {
      fastify.log.error(e);
      return reply.code(500).send({ error: "Failed to load heavy builder data" });
    }
  });

  fastify.get("/accessories/class-mod/builder-data", async (_request, reply) => {
    try {
      const data = getClassModBuilderData();
      return reply.send(data);
    } catch (e) {
      fastify.log.error(e);
      return reply.code(500).send({ error: "Failed to load class mod builder data" });
    }
  });

  // Serve class mod skill icons (same layout as desktop: class_mods/Amon|Harlowe|Rafa|Vex/*.png)
  const allowedClasses = ["Amon", "Harlowe", "Rafa", "Vex"];
  const safeFilename = /^[a-zA-Z0-9_!]+\.png$/;
  const __dirnameRoutes = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(__dirnameRoutes, "..", "..", "..");

  fastify.get<{ Params: { className: string; filename: string } }>(
    "/accessories/class-mod/skill-icon/:className/:filename",
    async (request, reply) => {
      const { className, filename } = request.params;
      if (!allowedClasses.includes(className) || !safeFilename.test(filename)) {
        return reply.code(404).send({ error: "Not found" });
      }
      const filePath = join(repoRoot, "class_mods", className, filename);
      if (!existsSync(filePath)) {
        return reply.code(404).send({ error: "Not found" });
      }
      return reply
        .type("image/png")
        .send(createReadStream(filePath));
    },
  );

  fastify.get("/accessories/enhancement/builder-data", async (_request, reply) => {
    try {
      const data = getEnhancementBuilderData();
      return reply.send(data);
    } catch (e) {
      fastify.log.error(e);
      return reply.code(500).send({ error: "Failed to load enhancement builder data" });
    }
  });
}
