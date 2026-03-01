import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { getVersionInfo } from "../data/version.js";

export async function versionRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  fastify.get("/", async (_request, reply) => {
    const info = getVersionInfo();
    return reply.send(info);
  });
}
