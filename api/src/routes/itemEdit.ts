import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { getItemEditData } from "../data/itemEdit.js";

export async function itemEditRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  fastify.get("/item-edit/data", async (_request, reply) => {
    try {
      const data = getItemEditData();
      return reply.send(data);
    } catch (e) {
      fastify.log.error(e);
      return reply.code(500).send({ error: "Failed to load item edit data" });
    }
  });
}

