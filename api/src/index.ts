import path from "path";
import fs from "fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { healthRoutes } from "./routes/health.js";
import { versionRoutes } from "./routes/version.js";
import { partsRoutes } from "./routes/parts.js";
import { newsRoutes } from "./routes/news.js";
import { adminRoutes } from "./routes/admin.js";
import { saveRoutes } from "./routes/save.js";
import { weaponGenRoutes } from "./routes/weaponGen.js";
import { weaponEditRoutes } from "./routes/weaponEdit.js";
import { itemEditRoutes } from "./routes/itemEdit.js";
import { accessoriesRoutes } from "./routes/accessories.js";
import { communityRoutes } from "./routes/community.js";
import { communityProfileRoutes } from "./routes/communityProfiles.js";
import { communityGodrollRoutes } from "./routes/communityGodrolls.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { terraVaultRoutes } from "./routes/terraVault.js";
import { greenVaultRoutes } from "./routes/greenVault.js";
import { statsRoutes } from "./routes/stats.js";
import { buildFromUrlRoutes } from "./routes/buildFromUrl.js";
import { getAllParts } from "./data/parts.js";

const SOCKET_ERROR_LISTENER_FLAG = Symbol("bl4_socket_error_listener_attached");

const fastify = Fastify({
  logger: true,
  bodyLimit: 15 * 1024 * 1024, // 15MB so large .sav base64 payloads aren't truncated
  keepAliveTimeout: 65_000, // 65s; helps with proxies (e.g. Render) without holding connections forever
  requestTimeout: 100_000, // 100s so long save ops can finish; socket error handler prevents crash on client disconnect
  // Prevent client disconnect (EPIPE/ECONNRESET) from crashing the process
  clientErrorHandler: (err: NodeJS.ErrnoException, socket) => {
    if (err.code === "EPIPE" || err.code === "ECONNRESET") {
      fastify.log.info({ err, code: err.code }, "Client connection closed");
    } else {
      fastify.log.warn({ err }, "Client connection error");
    }
    if (socket && !socket.destroyed) socket.destroy();
  },
});

await fastify.register(cors, { origin: true });

// Attach ONE socket error handler per underlying socket to avoid MaxListenersExceededWarning.
fastify.addHook("onRequest", async (request) => {
  const rawSocket = request.raw.socket as NodeJS.Socket & { [SOCKET_ERROR_LISTENER_FLAG]?: boolean };
  if (!rawSocket || rawSocket[SOCKET_ERROR_LISTENER_FLAG]) return;
  rawSocket[SOCKET_ERROR_LISTENER_FLAG] = true;
  rawSocket.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE" || err.code === "ECONNRESET") {
      fastify.log.info({ err, code: err.code }, "Client disconnected before response");
    } else {
      fastify.log.warn({ err }, "Request socket error");
    }
  });
});

const STAGING_KEY = process.env.STAGING_KEY?.trim();
if (STAGING_KEY) {
  fastify.addHook("onRequest", async (request, reply) => {
    const pathname = request.url?.split("?")[0] ?? "";
    // Allow root and health (with or without /api prefix for combined deploy)
    if (pathname === "/" || pathname === "/health" || pathname === "/api/health") return;
    const key = request.headers["x-staging-key"];
    if (key !== STAGING_KEY) {
      return reply.code(401).send({ error: "Staging access required" });
    }
  });
  fastify.log.info("Staging protection enabled (STAGING_KEY set)");
}

// API routes under /api (so one origin for app + API, e.g. https://bl4editor.com/api/...)
await fastify.register(healthRoutes, { prefix: "/api" });
await fastify.register(versionRoutes, { prefix: "/api/version" });
await fastify.register(partsRoutes, { prefix: "/api/parts" });
await fastify.register(newsRoutes, { prefix: "/api/news" });
await fastify.register(adminRoutes, { prefix: "/api/admin" });
await fastify.register(saveRoutes, { prefix: "/api" });
await fastify.register(weaponGenRoutes, { prefix: "/api" });
await fastify.register(weaponEditRoutes, { prefix: "/api" });
await fastify.register(itemEditRoutes, { prefix: "/api" });
await fastify.register(accessoriesRoutes, { prefix: "/api" });
await fastify.register(communityRoutes, { prefix: "/api" });
await fastify.register(communityProfileRoutes, { prefix: "/api" });
await fastify.register(communityGodrollRoutes, { prefix: "/api" });
await fastify.register(feedbackRoutes, { prefix: "/api" });
await fastify.register(terraVaultRoutes, { prefix: "/api" });
await fastify.register(greenVaultRoutes, { prefix: "/api" });
await fastify.register(statsRoutes, { prefix: "/api" });
await fastify.register(buildFromUrlRoutes, { prefix: "/api" });

// Optional: serve web app from same process (for Render single-service deploy)
const webDist = path.join(process.cwd(), "web", "dist");
if (fs.existsSync(webDist)) {
  await fastify.register(fastifyStatic, { root: webDist, prefix: "/" });
  fastify.setNotFoundHandler((request, reply) => {
    const pathname = request.url?.split("?")[0] ?? "";
    if (request.method === "GET" && !pathname.startsWith("/api")) {
      return reply.sendFile("index.html", webDist);
    }
    return reply.code(404).send({ error: "Not found" });
  });
  fastify.log.info("Serving web app from /");
}

const partsCount = getAllParts().length;
fastify.log.info(`Parts dataset loaded: ${partsCount} rows`);

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "0.0.0.0";

try {
  await fastify.listen({ port, host });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
