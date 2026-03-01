import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { getNews } from "../data/news.js";

export async function newsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  fastify.get("/", async (_request, reply) => {
    const content = getNews();
    return reply.send({ content });
  });
}
