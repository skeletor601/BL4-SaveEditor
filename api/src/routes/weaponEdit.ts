import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { getWeaponEditData } from "../data/weaponEdit.js";

export async function weaponEditRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  fastify.get("/weapon-edit/data", async (_request, reply) => {
    try {
      const data = getWeaponEditData();
      return reply.send(data);
    } catch (e) {
      fastify.log.error(e);
      return reply.code(500).send({ error: "Failed to load weapon edit data" });
    }
  });
}

