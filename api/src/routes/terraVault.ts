/**
 * Terra's Vault — private code storage for Terra's weapon/grenade codes.
 * Saved codes can be tagged, labeled, and examined by DrLecter to train the generators.
 */
import { FastifyInstance } from "fastify";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT_PATH = join(__dirname, "../../data/terra_vault.json");
const MAX_ENTRIES = 500;

export interface VaultEntry {
  id: string;
  label: string;
  code: string;
  type: "weapon" | "grenade" | "shield" | "class-mod" | "repkit" | "enhancement" | "heavy" | "other";
  tags: string[];
  notes: string;
  author: string;
  timestamp: number;
}

function loadVault(): VaultEntry[] {
  try {
    if (!existsSync(VAULT_PATH)) return [];
    return JSON.parse(readFileSync(VAULT_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveVault(entries: VaultEntry[]): void {
  writeFileSync(VAULT_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

export async function terraVaultRoutes(fastify: FastifyInstance, _opts: unknown) {
  // GET all vault entries
  fastify.get("/terra-vault", async (_request, reply) => {
    reply.send(loadVault());
  });

  // POST new entry
  fastify.post("/terra-vault", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const label = String(body.label ?? "").trim();
    const code = String(body.code ?? "").trim();
    const type = String(body.type ?? "other").trim();
    const tags = Array.isArray(body.tags) ? (body.tags as string[]).map((t) => String(t).trim()).filter(Boolean) : [];
    const notes = String(body.notes ?? "").trim();
    const author = String(body.author ?? "Terra").trim();

    if (!code) return reply.code(400).send({ error: "Code is required." });
    if (!label) return reply.code(400).send({ error: "Label is required." });

    const entry: VaultEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      code,
      type: type as VaultEntry["type"],
      tags,
      notes,
      author,
      timestamp: Date.now(),
    };

    const entries = loadVault();
    entries.unshift(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(MAX_ENTRIES);
    saveVault(entries);

    reply.code(201).send({ success: true, id: entry.id });
  });

  // DELETE entry
  fastify.delete("/terra-vault/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const entries = loadVault();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return reply.code(404).send({ error: "Not found." });
    entries.splice(idx, 1);
    saveVault(entries);
    reply.send({ success: true });
  });

  // PATCH update label/notes/tags
  fastify.patch("/terra-vault/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const entries = loadVault();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return reply.code(404).send({ error: "Not found." });

    if (typeof body.label === "string") entry.label = body.label.trim();
    if (typeof body.notes === "string") entry.notes = body.notes.trim();
    if (Array.isArray(body.tags)) entry.tags = (body.tags as string[]).map((t) => String(t).trim()).filter(Boolean);
    if (typeof body.type === "string") entry.type = body.type.trim() as VaultEntry["type"];

    saveVault(entries);
    reply.send({ success: true });
  });
}
