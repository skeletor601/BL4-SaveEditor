import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { decryptSave, encryptSaveRaw } from "../lib/saveCrypto.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const DECODE_SCRIPT = join(REPO_ROOT, "scripts", "decode_serials.py");
const SAVE_MUTATE_SCRIPT = join(REPO_ROOT, "scripts", "save_mutate.py");
const ENCODE_SCRIPT = join(REPO_ROOT, "scripts", "encode_serial.py");

type SaveMutatePayload = {
  yaml_content: string;
  action: "sync_levels" | "add_item" | "apply_preset" | "update_item";
  params?: Record<string, unknown>;
};

type SaveMutateResult = {
  success: boolean;
  yaml_content?: string;
  error?: string;
  success_count?: number;
  fail_count?: number;
  info?: string[];
};

function runSaveMutate(payload: SaveMutatePayload): Promise<SaveMutateResult> {
  return new Promise((resolve, reject) => {
    const python = process.platform === "win32" ? "python" : "python3";
    const child = spawn(python, [SAVE_MUTATE_SCRIPT], {
      cwd: REPO_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const input = JSON.stringify(payload);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      try {
        const result = JSON.parse(stdout) as SaveMutateResult;
        resolve(result);
      } catch {
        reject(new Error(stderr || `save_mutate.py exited ${code}`));
      }
    });
    child.stdin.end(input, "utf8");
  });
}

function runDecodeSerials(serials: string[]): Promise<{ items: Array<Record<string, unknown>> }> {
  return new Promise((resolve, reject) => {
    const python = process.platform === "win32" ? "python" : "python3";
    const child = spawn(python, [DECODE_SCRIPT], {
      cwd: REPO_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const input = JSON.stringify({ serials });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `decode_serials.py exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as { items: Array<Record<string, unknown>> });
      } catch (e) {
        reject(new Error("Invalid JSON from decode script"));
      }
    });
    child.stdin.end(input, "utf8");
  });
}

type EncodeSerialResult = { success: boolean; serial?: string; error?: string };

function runEncodeSerial(decodedString: string, newLevel?: number): Promise<EncodeSerialResult> {
  return new Promise((resolve, reject) => {
    const python = process.platform === "win32" ? "python" : "python3";
    const child = spawn(python, [ENCODE_SCRIPT], {
      cwd: REPO_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const payload: { decoded_string: string; new_level?: number } = { decoded_string: decodedString };
    if (newLevel != null) payload.new_level = newLevel;
    const input = JSON.stringify(payload);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (err) => reject(err));
    child.on("close", () => {
      try {
        resolve(JSON.parse(stdout) as EncodeSerialResult);
      } catch {
        reject(new Error(stderr || "Invalid JSON from encode script"));
      }
    });
    child.stdin.end(input, "utf8");
  });
}

function sendEncryptResponse(
  reply: import("fastify").FastifyReply,
  encrypted: Buffer,
  debug: import("../lib/saveCrypto.js").EncryptDebug,
  filename: string,
  asJson: boolean
) {
  if (asJson) {
    return reply.send({
      success: true,
      sav_data: encrypted.toString("base64"),
      filename,
      debug: {
        platform: debug.platform,
        decryptedLength: debug.decryptedLength,
        compressedLength: debug.compressedLength,
        adler32Hex: debug.adler32Hex,
        trailerHex: debug.trailerHex,
        paddingLength: debug.paddingLength,
        encryptedLength: debug.encryptedLength,
        encryptedFirst64Hex: debug.encryptedFirst64Hex,
        encryptedLast64Hex: debug.encryptedLast64Hex,
      },
    });
  }
  reply
    .header("Content-Type", "application/octet-stream")
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .header("X-Debug-Platform", debug.platform)
    .header("X-Debug-Decrypted-Length", String(debug.decryptedLength))
    .header("X-Debug-Compressed-Length", String(debug.compressedLength))
    .header("X-Debug-Adler32-Hex", debug.adler32Hex)
    .header("X-Debug-Trailer-Hex", debug.trailerHex)
    .header("X-Debug-Padding-Length", String(debug.paddingLength))
    .header("X-Debug-Encrypted-First64-Hex", debug.encryptedFirst64Hex)
    .header("X-Debug-Encrypted-Last64-Hex", debug.encryptedLast64Hex)
    .send(encrypted);
}

export async function saveRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  fastify.post<{
    Body: { user_id?: string; sav_data?: string };
  }>("/save/decrypt", async (request, reply) => {
    const body = request.body as { user_id?: string; sav_data?: string } | undefined;
    const userId = body?.user_id?.trim();
    const savDataB64 = body?.sav_data;
    if (!userId) {
      return reply.code(400).send({ success: false, error: "user_id is required" });
    }
    if (!savDataB64 || typeof savDataB64 !== "string") {
      return reply.code(400).send({ success: false, error: "sav_data (base64) is required" });
    }
    let encBytes: Buffer;
    try {
      encBytes = Buffer.from(savDataB64, "base64");
    } catch {
      return reply.code(400).send({ success: false, error: "sav_data must be valid base64" });
    }
    try {
      const result = await decryptSave(encBytes, userId);
      return reply.send({
        success: true,
        yaml_content: result.yamlContent,
        platform: result.platform,
        raw_bytes_base64: result.rawBytes.toString("base64"),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Decryption failed";
      fastify.log.warn({ err: e }, "save/decrypt failed");
      return reply.code(400).send({ success: false, error: message });
    }
  });

  fastify.post<{
    Body: {
      user_id?: string;
      platform?: string;
      yaml_content?: string;
      raw_bytes_base64?: string;
      filename?: string;
    };
    Querystring: { metadata?: string };
  }>("/save/encrypt", async (request, reply) => {
    const body = request.body as {
      user_id?: string;
      platform?: string;
      yaml_content?: string;
      raw_bytes_base64?: string;
      filename?: string;
    };
    const query = request.query as { metadata?: string };
    const userId = body?.user_id?.trim();
    const platform = body?.platform;
    const yamlContent = body?.yaml_content;
    const rawBytesB64 = body?.raw_bytes_base64;
    const filename = (body?.filename?.trim() || "save.sav").replace(/[^\w.\-]/g, "_") || "save.sav";
    const asJson = query?.metadata === "1";

    if (!userId) {
      return reply.code(400).send({ success: false, error: "user_id is required" });
    }
    if (platform !== "epic" && platform !== "steam") {
      return reply.code(400).send({ success: false, error: "platform must be 'epic' or 'steam'" });
    }
    let plainBytes: Buffer;
    if (rawBytesB64 != null && typeof rawBytesB64 === "string") {
      try {
        plainBytes = Buffer.from(rawBytesB64, "base64");
      } catch {
        return reply.code(400).send({ success: false, error: "raw_bytes_base64 must be valid base64" });
      }
    } else if (yamlContent != null && typeof yamlContent === "string") {
      plainBytes = Buffer.from(yamlContent, "utf-8");
    } else {
      return reply.code(400).send({
        success: false,
        error: "Either yaml_content or raw_bytes_base64 is required",
      });
    }
    try {
      const { encrypted, debug } = await encryptSaveRaw(plainBytes, userId, platform);
      fastify.log.info({ debug }, "save/encrypt");
      return sendEncryptResponse(reply, encrypted, debug, filename, asJson);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Encryption failed";
      fastify.log.warn({ err: e }, "save/encrypt failed");
      return reply.code(400).send({ success: false, error: message });
    }
  });

  fastify.post<{
    Body: { serials?: string[] };
  }>("/save/decode-items", async (request, reply) => {
    const body = request.body as { serials?: string[] } | undefined;
    const serials = Array.isArray(body?.serials) ? body.serials : [];
    const valid = serials.filter((s) => typeof s === "string" && s.trim().startsWith("@U"));
    if (valid.length === 0) {
      return reply.send({ success: true, items: [] });
    }
    try {
      const result = await runDecodeSerials(valid);
      return reply.send({ success: true, items: result.items });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Decode failed";
      fastify.log.warn({ err: e }, "save/decode-items failed");
      return reply.code(500).send({ success: false, error: message });
    }
  });

  fastify.post<{
    Body: { decoded_string?: string; new_level?: number };
  }>("/save/encode-serial", async (request, reply) => {
    const body = request.body as { decoded_string?: string; new_level?: number } | undefined;
    const decodedString = body?.decoded_string;
    const newLevel = body?.new_level;
    if (!decodedString || typeof decodedString !== "string" || !decodedString.trim()) {
      return reply.code(400).send({ success: false, error: "decoded_string is required" });
    }
    try {
      const result = await runEncodeSerial(decodedString.trim(), newLevel);
      if (!result.success) {
        return reply.code(400).send({ success: false, error: result.error ?? "Encode failed" });
      }
      return reply.send({ success: true, serial: result.serial ?? "" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Encode failed";
      fastify.log.warn({ err: e }, "save/encode-serial failed");
      return reply.code(500).send({ success: false, error: message });
    }
  });

  fastify.post<{ Body: { yaml_content?: string } }>("/save/sync-levels", async (request, reply) => {
    const body = request.body as { yaml_content?: string } | undefined;
    const yamlContent = body?.yaml_content;
    if (!yamlContent || typeof yamlContent !== "string") {
      return reply.code(400).send({ success: false, error: "yaml_content is required" });
    }
    try {
      const result = await runSaveMutate({
        yaml_content: yamlContent,
        action: "sync_levels",
        params: {},
      });
      if (!result.success) {
        return reply.code(400).send({ success: false, error: result.error ?? "Sync failed" });
      }
      return reply.send({
        success: true,
        yaml_content: result.yaml_content,
        success_count: result.success_count ?? 0,
        fail_count: result.fail_count ?? 0,
        info: result.info ?? [],
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sync failed";
      fastify.log.warn({ err: e }, "save/sync-levels failed");
      return reply.code(500).send({ success: false, error: message });
    }
  });

  fastify.post<{
    Body: { yaml_content?: string; serial?: string; flag?: string };
  }>("/save/add-item", async (request, reply) => {
    const body = request.body as { yaml_content?: string; serial?: string; flag?: string } | undefined;
    const yamlContent = body?.yaml_content;
    const serial = body?.serial?.trim();
    const flag = body?.flag != null ? String(body.flag) : "0";
    if (!yamlContent || typeof yamlContent !== "string") {
      return reply.code(400).send({ success: false, error: "yaml_content is required" });
    }
    if (!serial || !serial.startsWith("@U")) {
      return reply.code(400).send({ success: false, error: "serial (item serial starting with @U) is required" });
    }
    try {
      const result = await runSaveMutate({
        yaml_content: yamlContent,
        action: "add_item",
        params: { serial, flag },
      });
      if (!result.success) {
        return reply.code(400).send({ success: false, error: result.error ?? "Add item failed" });
      }
      return reply.send({ success: true, yaml_content: result.yaml_content });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Add item failed";
      fastify.log.warn({ err: e }, "save/add-item failed");
      return reply.code(500).send({ success: false, error: message });
    }
  });

  fastify.post<{
    Body: { yaml_content?: string; item_path?: string[]; new_item_data?: { serial?: string } };
  }>("/save/update-item", async (request, reply) => {
    const body = request.body as { yaml_content?: string; item_path?: string[]; new_item_data?: { serial?: string } } | undefined;
    const yamlContent = body?.yaml_content;
    const itemPath = body?.item_path;
    const newItemData = body?.new_item_data;
    if (!yamlContent || typeof yamlContent !== "string") {
      return reply.code(400).send({ success: false, error: "yaml_content is required" });
    }
    if (!Array.isArray(itemPath) || itemPath.length === 0) {
      return reply.code(400).send({ success: false, error: "item_path (array of keys) is required" });
    }
    const serial = newItemData?.serial?.trim();
    if (!serial || !serial.startsWith("@U")) {
      return reply.code(400).send({ success: false, error: "new_item_data.serial (valid @U... serial) is required" });
    }
    try {
      const result = await runSaveMutate({
        yaml_content: yamlContent,
        action: "update_item",
        params: { item_path: itemPath, new_item_data: { serial } },
      });
      if (!result.success) {
        return reply.code(400).send({ success: false, error: result.error ?? "Update item failed" });
      }
      return reply.send({ success: true, yaml_content: result.yaml_content });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Update item failed";
      fastify.log.warn({ err: e }, "save/update-item failed");
      return reply.code(500).send({ success: false, error: message });
    }
  });

  fastify.post<{
    Body: { yaml_content?: string; preset_name?: string; class_key?: string };
  }>("/save/apply-preset", async (request, reply) => {
    const body = request.body as { yaml_content?: string; preset_name?: string; class_key?: string } | undefined;
    const yamlContent = body?.yaml_content;
    const presetName = body?.preset_name?.trim();
    const classKey = body?.class_key?.trim();
    if (!yamlContent || typeof yamlContent !== "string") {
      return reply.code(400).send({ success: false, error: "yaml_content is required" });
    }
    if (!presetName) {
      return reply.code(400).send({ success: false, error: "preset_name is required" });
    }
    const params: Record<string, unknown> = { preset_name: presetName };
    if (classKey) params.class_key = classKey;
    try {
      const result = await runSaveMutate({
        yaml_content: yamlContent,
        action: "apply_preset",
        params,
      });
      if (!result.success) {
        return reply.code(400).send({ success: false, error: result.error ?? "Apply preset failed" });
      }
      return reply.send({ success: true, yaml_content: result.yaml_content });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Apply preset failed";
      fastify.log.warn({ err: e }, "save/apply-preset failed");
      return reply.code(500).send({ success: false, error: message });
    }
  });
}
