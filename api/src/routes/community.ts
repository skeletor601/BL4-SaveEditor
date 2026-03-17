/**
 * Community Recipe Vault — Feature 16
 * Simple flat-JSON store for user-submitted grenade/weapon recipes.
 * Per-IP rate limiting is in-memory (resets on server restart).
 */
import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_PATH = join(__dirname, "../../data/community_recipes.json");

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
  fastify.get("/community/recipes", async (_request: FastifyRequest, reply: FastifyReply) => {
    const recipes = loadRecipes();
    return reply.send({
      success: true,
      recipes: recipes.sort((a, b) => b.upvotes - a.upvotes || b.submittedAt - a.submittedAt),
    });
  });

  // POST /api/community/recipes — submit a new recipe
  fastify.post("/community/recipes", async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = request.ip ?? "unknown";
    if (!checkRateLimit(ip)) {
      return reply.code(429).send({ error: "Rate limit exceeded. Try again later." });
    }

    const body = request.body as Record<string, unknown>;
    const { itemType, title, description, code, decoded } = body ?? {};

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
    };

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
}
