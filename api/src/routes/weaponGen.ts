import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { getWeaponGenData } from "../data/weaponGen.js";

export async function weaponGenRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  fastify.get("/weapon-gen/data", async (_request, reply) => {
    try {
      const data = getWeaponGenData();
      return reply.send(data);
    } catch (e) {
      fastify.log.error(e);
      return reply.code(500).send({ error: "Failed to load weapon gen data" });
    }
  });
}
