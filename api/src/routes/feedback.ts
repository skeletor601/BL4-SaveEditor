/**
 * Feedback API — Terra (and other testers) can submit bug reports, ideas, questions.
 * DrLecter sees them at /drlecter. Simple flat JSON store.
 */
import { FastifyInstance } from "fastify";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { persistPath } from "../lib/persistPath.js";
const FEEDBACK_PATH = persistPath("feedback.json");
const MAX_ENTRIES = 200;

export interface FeedbackEntry {
  id: string;
  author: string;
  type: "bug" | "idea" | "question" | "note";
  message: string;
  page: string;
  status: "new" | "seen" | "fixed" | "wontfix";
  reply?: string;
  timestamp: number;
}

function loadFeedback(): FeedbackEntry[] {
  try {
    if (!existsSync(FEEDBACK_PATH)) return [];
    return JSON.parse(readFileSync(FEEDBACK_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveFeedback(entries: FeedbackEntry[]): void {
  writeFileSync(FEEDBACK_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

export async function feedbackRoutes(fastify: FastifyInstance, _opts: unknown) {
  // GET all feedback (newest first)
  fastify.get("/feedback", async (_request, reply) => {
    const entries = loadFeedback();
    reply.send(entries);
  });

  // POST new feedback
  fastify.post("/feedback", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const author = String(body.author ?? "").trim();
    const type = String(body.type ?? "note").trim();
    const message = String(body.message ?? "").trim();
    const page = String(body.page ?? "").trim();

    if (!message) {
      return reply.code(400).send({ error: "Message is required." });
    }
    if (!author) {
      return reply.code(400).send({ error: "Author name is required." });
    }
    if (!["bug", "idea", "question", "note"].includes(type)) {
      return reply.code(400).send({ error: "Type must be bug, idea, question, or note." });
    }

    const entry: FeedbackEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      author,
      type: type as FeedbackEntry["type"],
      message,
      page,
      status: "new",
      timestamp: Date.now(),
    };

    const entries = loadFeedback();
    entries.unshift(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(MAX_ENTRIES);
    saveFeedback(entries);

    reply.code(201).send({ success: true, id: entry.id });
  });

  // PATCH update status or reply (for DrLecter)
  fastify.patch("/feedback/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const entries = loadFeedback();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return reply.code(404).send({ error: "Not found." });

    if (body.status && ["new", "seen", "fixed", "wontfix"].includes(String(body.status))) {
      entry.status = String(body.status) as FeedbackEntry["status"];
    }
    if (typeof body.reply === "string") {
      entry.reply = body.reply.trim();
    }

    saveFeedback(entries);
    reply.send({ success: true });
  });
}
