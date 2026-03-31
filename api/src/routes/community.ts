/**
 * Community Recipe Vault — Feature 16
 * Simple flat-JSON store for user-submitted grenade/weapon recipes.
 * Per-IP rate limiting is in-memory (resets on server restart).
 */
import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { persistPath } from "../lib/persistPath.js";
import { lookupProfileBySeed } from "./communityProfiles.js";
const RECIPES_PATH = persistPath("community_recipes.json");
const IMAGES_DIR = persistPath("community_images");
// Ensure images directory exists
if (!existsSync(IMAGES_DIR)) mkdirSync(IMAGES_DIR, { recursive: true });

// In-memory rate limit: max 5 submissions per IP per hour
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const ipSubmissions = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const rec = ipSubmissions.get(ip);
  if (!rec || now - rec.windowStart > RATE_WINDOW_MS) {
    ipSubmissions.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (rec.count >= RATE_LIMIT) return false;
  rec.count++;
  return true;
}

export interface CommunityRecipe {
  id: string;
  itemType: string;
  title: string;
  description?: string;
  code: string;
  decoded?: string;
  submittedAt: number;
  upvotes: number;
  seed?: number;
  authorName?: string;
  imageFilename?: string;
}

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

function saveBase64Image(base64: string, recipeId: string): string | null {
  // Expect "data:image/png;base64,iVBOR..." or raw base64
  const match = base64.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const ext = ALLOWED_MIME[mime];
  if (!ext) return null;
  const buf = Buffer.from(match[2], "base64");
  if (buf.length > MAX_IMAGE_BYTES) return null;
  const filename = `${recipeId}${ext}`;
  writeFileSync(join(IMAGES_DIR, filename), buf);
  return filename;
}

function loadRecipes(): CommunityRecipe[] {
  if (!existsSync(RECIPES_PATH)) return [];
  try {
    return JSON.parse(readFileSync(RECIPES_PATH, "utf-8")) as CommunityRecipe[];
  } catch {
    return [];
  }
}

function saveRecipes(recipes: CommunityRecipe[]): void {
  writeFileSync(RECIPES_PATH, JSON.stringify(recipes, null, 2), "utf-8");
}

export async function communityRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /api/community/recipes — browse all recipes (sorted by upvotes desc, newest first)
  // Attaches authorName from community profiles based on seed
  fastify.get("/community/recipes", async (_request: FastifyRequest, reply: FastifyReply) => {
    const recipes = loadRecipes();
    const enriched = recipes.map((r) => {
      if (r.seed && !r.authorName) {
        const profile = lookupProfileBySeed(r.seed);
        if (profile) return { ...r, authorName: profile.name };
      }
      return r;
    });
    return reply.send({
      success: true,
      recipes: enriched.sort((a, b) => b.upvotes - a.upvotes || b.submittedAt - a.submittedAt),
    });
  });

  // POST /api/community/recipes — submit a new recipe
  fastify.post("/community/recipes", async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = request.ip ?? "unknown";
    if (!checkRateLimit(ip)) {
      return reply.code(429).send({ error: "Rate limit exceeded. Try again later." });
    }

    const body = request.body as Record<string, unknown>;
    const { itemType, title, description, code, decoded, seed, image } = body ?? {};

    if (typeof code !== "string" || !code.trim().startsWith("@U")) {
      return reply.code(400).send({ error: "code must be a Base85 serial starting with @U" });
    }
    if (typeof title !== "string" || !title.trim()) {
      return reply.code(400).send({ error: "title is required" });
    }
    if (typeof itemType !== "string" || !itemType.trim()) {
      return reply.code(400).send({ error: "itemType is required" });
    }

    const recipes = loadRecipes();
    const newRecipe: CommunityRecipe = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      itemType: String(itemType).trim().slice(0, 50),
      title: String(title).trim().slice(0, 100),
      description: typeof description === "string" ? description.trim().slice(0, 500) : undefined,
      code: String(code).trim(),
      decoded: typeof decoded === "string" ? decoded.trim().slice(0, 2000) : undefined,
      submittedAt: Date.now(),
      upvotes: 0,
      seed: typeof seed === "number" && Number.isFinite(seed) && seed >= 1 && seed <= 9999 ? Math.trunc(seed) : undefined,
    };

    // Save optional image
    if (typeof image === "string" && image.startsWith("data:image/")) {
      const filename = saveBase64Image(image, newRecipe.id);
      if (filename) newRecipe.imageFilename = filename;
    }

    recipes.unshift(newRecipe);
    // Keep max 500 recipes
    if (recipes.length > 500) recipes.splice(500);
    saveRecipes(recipes);

    return reply.code(201).send({ success: true, recipe: newRecipe });
  });

  // POST /api/community/recipes/:id/upvote — upvote a recipe
  fastify.post("/community/recipes/:id/upvote", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const recipes = loadRecipes();
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) return reply.code(404).send({ error: "Recipe not found" });
    recipe.upvotes++;
    saveRecipes(recipes);
    return reply.send({ success: true, upvotes: recipe.upvotes });
  });

  // POST /api/community/recipes/:id/image — add/replace image on an existing recipe
  fastify.post("/community/recipes/:id/image", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const { image } = body ?? {};
    if (typeof image !== "string" || !image.startsWith("data:image/")) {
      return reply.code(400).send({ error: "image must be a base64 data URL (data:image/jpeg;base64,...)" });
    }
    const recipes = loadRecipes();
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) return reply.code(404).send({ error: "Recipe not found" });
    const filename = saveBase64Image(image, id);
    if (!filename) return reply.code(400).send({ error: "Invalid image (must be JPEG/PNG/WebP, max 2MB)" });
    recipe.imageFilename = filename;
    saveRecipes(recipes);
    return reply.send({ success: true, imageFilename: filename });
  });

  // GET /api/community/images/:filename — serve a community recipe image
  fastify.get("/community/images/:filename", async (request: FastifyRequest, reply: FastifyReply) => {
    const { filename } = request.params as { filename: string };
    // Sanitize: only allow alphanumeric, dash, dot
    if (!/^[\w\-.]+$/.test(filename)) return reply.code(400).send({ error: "Invalid filename" });
    const filePath = join(IMAGES_DIR, filename);
    if (!existsSync(filePath)) return reply.code(404).send({ error: "Image not found" });
    const ext = filename.split(".").pop()?.toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const buf = readFileSync(filePath);
    return reply.header("Content-Type", mime).header("Cache-Control", "public, max-age=86400").send(buf);
  });
}
