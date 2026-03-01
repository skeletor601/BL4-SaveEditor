import type { FastifyInstance, FastifyPluginOptions } from "fastify";

export async function healthRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  fastify.get("/health", async (_request, reply) => {
    return reply.send({ ok: true, timestamp: new Date().toISOString() });
  });
}
