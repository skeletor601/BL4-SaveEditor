import Fastify from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";
import { versionRoutes } from "./routes/version.js";
import { partsRoutes } from "./routes/parts.js";
import { newsRoutes } from "./routes/news.js";
import { adminRoutes } from "./routes/admin.js";

const fastify = Fastify({ logger: true });

await fastify.register(cors, { origin: true });

await fastify.register(healthRoutes, { prefix: "/" });
await fastify.register(versionRoutes, { prefix: "/version" });
await fastify.register(partsRoutes, { prefix: "/parts" });
await fastify.register(newsRoutes, { prefix: "/news" });
await fastify.register(adminRoutes, { prefix: "/admin" });

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "0.0.0.0";

try {
  await fastify.listen({ port, host });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
