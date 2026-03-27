/**
 * Green's Vault — private code storage for Green's weapon/grenade codes.
 * Same structure as Terra's vault, separate persistent storage.
 */
import { FastifyInstance } from "fastify";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { persistPath } from "../lib/persistPath.js";

const VAULT_PATH = persistPath("green_vault.json");
const MAX_ENTRIES = 500;

interface VaultEntry {
  id: string;
  label: string;
  code: string;
  type: string;
  tags: string[];
  notes: string;
  author: string;
  timestamp: number;
}

function loadVault(): VaultEntry[] {
  try { if (!existsSync(VAULT_PATH)) return []; return JSON.parse(readFileSync(VAULT_PATH, "utf-8")); } catch { return []; }
}
function saveVault(entries: VaultEntry[]): void {
  writeFileSync(VAULT_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

export async function greenVaultRoutes(fastify: FastifyInstance, _opts: unknown) {
  fastify.get("/green-vault", async (_request, reply) => { reply.send(loadVault()); });

  fastify.post("/green-vault", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const label = String(body.label ?? "").trim();
    const code = String(body.code ?? "").trim();
    const type = String(body.type ?? "other").trim();
    const tags = Array.isArray(body.tags) ? (body.tags as string[]).map((t) => String(t).trim()).filter(Boolean) : [];
    const notes = String(body.notes ?? "").trim();
    const author = String(body.author ?? "Green").trim();
    if (!code) return reply.code(400).send({ error: "Code is required." });
    if (!label) return reply.code(400).send({ error: "Label is required." });
    const entry: VaultEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label, code, type, tags, notes, author, timestamp: Date.now(),
    };
    const entries = loadVault();
    entries.unshift(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(MAX_ENTRIES);
    saveVault(entries);
    reply.code(201).send({ success: true, id: entry.id });
  });

  fastify.delete("/green-vault/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const entries = loadVault();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return reply.code(404).send({ error: "Not found." });
    entries.splice(idx, 1);
    saveVault(entries);
    reply.send({ success: true });
  });

  fastify.patch("/green-vault/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const entries = loadVault();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return reply.code(404).send({ error: "Not found." });
    if (typeof body.label === "string") entry.label = body.label.trim();
    if (typeof body.code === "string") entry.code = body.code.trim();
    if (typeof body.notes === "string") entry.notes = body.notes.trim();
    if (Array.isArray(body.tags)) entry.tags = (body.tags as string[]).map((t) => String(t).trim()).filter(Boolean);
    if (typeof body.type === "string") entry.type = body.type.trim();
    saveVault(entries);
    reply.send({ success: true });
  });

  // ── Green's Grenade Codes ──
  const GRENADE_CODES_PATH = persistPath("green_grenade_codes.json");

  interface GrenadeCode {
    id: string; name: string; code: string; rating: string; notes: string; timestamp: number;
  }

  function loadGrenadeCodes(): GrenadeCode[] {
    try { if (!existsSync(GRENADE_CODES_PATH)) return []; return JSON.parse(readFileSync(GRENADE_CODES_PATH, "utf-8")); } catch { return []; }
  }
  function saveGrenadeCodes(codes: GrenadeCode[]): void {
    writeFileSync(GRENADE_CODES_PATH, JSON.stringify(codes, null, 2), "utf-8");
  }

  fastify.get("/green-grenade-codes", async (_request, reply) => { reply.send(loadGrenadeCodes()); });

  fastify.post("/green-grenade-codes", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const code = String(body.code ?? "").trim();
    const rating = String(body.rating ?? "mid").trim();
    const notes = String(body.notes ?? "").trim();
    if (!code) return reply.code(400).send({ error: "Code is required." });
    const entry: GrenadeCode = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name || "Unnamed Grenade", code,
      rating: ["banger","good","mid","dud"].includes(rating) ? rating : "mid",
      notes, timestamp: Date.now(),
    };
    const codes = loadGrenadeCodes();
    codes.unshift(entry);
    if (codes.length > 200) codes.splice(200);
    saveGrenadeCodes(codes);
    reply.code(201).send({ success: true, id: entry.id });
  });

  fastify.delete("/green-grenade-codes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const codes = loadGrenadeCodes();
    const idx = codes.findIndex((c) => c.id === id);
    if (idx === -1) return reply.code(404).send({ error: "Not found." });
    codes.splice(idx, 1);
    saveGrenadeCodes(codes);
    reply.send({ success: true });
  });
}
