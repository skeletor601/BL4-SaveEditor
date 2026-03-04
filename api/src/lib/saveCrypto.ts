/**
 * BL4 save decrypt/encrypt — matches desktop save_game_controller.py.
 * Used by the save API so the pipeline runs on the server (deterministic, no browser crypto quirks).
 */

import { createDecipheriv, createCipheriv } from "crypto";
import { inflate, deflate } from "zlib";
import { promisify } from "util";

const inflateAsync = promisify(inflate);
const deflateAsync = promisify(deflate);

const PUBLIC_KEY = Buffer.from([
  0x35, 0xec, 0x33, 0x77, 0xf3, 0x5d, 0xb0, 0xea, 0xbe, 0x6b, 0x83, 0x11, 0x54, 0x03, 0xeb, 0xfb,
  0x27, 0x25, 0x64, 0x2e, 0xd5, 0x49, 0x06, 0x29, 0x05, 0x78, 0xbd, 0x60, 0xba, 0x4a, 0xa7, 0x87,
]);

function adler32(buf: Buffer): number {
  let a = 1,
    b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function keyEpic(uid: string): Buffer {
  const s = uid.trim();
  const utf16le = Buffer.alloc(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    utf16le[i * 2] = c & 0xff;
    utf16le[i * 2 + 1] = (c >> 8) & 0xff;
  }
  const k = Buffer.from(PUBLIC_KEY);
  const n = Math.min(utf16le.length, k.length);
  for (let i = 0; i < n; i++) k[i]! ^= utf16le[i]!;
  return k;
}

function keySteam(uid: string): Buffer {
  const digits = uid.replace(/\D/g, "");
  const sid = digits ? BigInt(digits) : 0n;
  const sidBytes = Buffer.allocUnsafe(8);
  for (let i = 0; i < 8; i++) sidBytes[i] = Number((sid >> BigInt(i * 8)) & 0xffn);
  const k = Buffer.from(PUBLIC_KEY);
  for (let i = 0; i < 8; i++) k[i % k.length]! ^= sidBytes[i]!;
  return k;
}

function stripPkcs7(buf: Buffer): Buffer {
  if (buf.length === 0) return buf;
  const n = buf[buf.length - 1]!;
  if (n < 1 || n > 16) return buf;
  for (let i = 1; i <= n; i++) if (buf[buf.length - i] !== n) return buf;
  return buf.subarray(0, buf.length - n);
}

function padPkcs7(buf: Buffer, blockSize: number): Buffer {
  const pad = blockSize - (buf.length % blockSize);
  const out = Buffer.allocUnsafe(buf.length + pad);
  buf.copy(out);
  out.fill(pad, buf.length);
  return out;
}

function tryDecrypt(enc: Buffer, key: Buffer, checksumBe: boolean): Promise<Buffer> {
  const decipher = createDecipheriv("aes-256-ecb", key, Buffer.alloc(0));
  decipher.setAutoPadding(false);
  let dec: Buffer;
  try {
    dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  } catch {
    return Promise.reject(new Error("AES decrypt failed (wrong key?)"));
  }
  const unp = stripPkcs7(dec);
  if (unp.length < 8) return Promise.reject(new Error("Data too short after unpadding"));
  const trailer = unp.subarray(-8);
  const ln = trailer.readUInt32LE(4);

  // Match desktop/iyre: try full buffer first (no-trailer format), then payload without last 8 bytes (trailer format)
  return inflateAsync(unp)
    .then((plain) => plain)
    .catch(() =>
      inflateAsync(unp.subarray(0, -8)).then((plain) => {
        if (plain.length !== ln) throw new Error(`Length mismatch: got ${plain.length}, expected ${ln}`);
        return plain;
      })
    );
}

export type DecryptResult = {
  yamlContent: string;
  platform: "epic" | "steam";
  /** Decrypted YAML UTF-8 bytes (for no-edit roundtrip without re-encoding). */
  rawBytes: Buffer;
};

export function decryptSave(encBytes: Buffer, userId: string): Promise<DecryptResult> {
  const uid = userId.trim();
  if (!uid) return Promise.reject(new Error("User ID cannot be empty"));

  const tryEpic = (): Promise<DecryptResult> =>
    tryDecrypt(encBytes, keyEpic(uid), true).then((plain) => ({
      yamlContent: plain.toString("utf-8"),
      platform: "epic",
      rawBytes: plain,
    }));
  const trySteam = (): Promise<DecryptResult> =>
    tryDecrypt(encBytes, keySteam(uid), false).then((plain) => ({
      yamlContent: plain.toString("utf-8"),
      platform: "steam",
      rawBytes: plain,
    }));

  const looksLikeSteam = /^\d+$/.test(uid) && uid.length >= 10 && uid.length <= 20;
  const first = looksLikeSteam ? trySteam : tryEpic;
  const second = looksLikeSteam ? tryEpic : trySteam;

  return first().catch(() => second()).catch((e) =>
    Promise.reject(
      new Error(
        "Decrypt failed. Check your Epic or Steam User ID and that the file is a valid BL4 .sav. " +
          (e instanceof Error ? e.message : String(e))
      )
    )
  );
}

export type EncryptDebug = {
  platform: "epic" | "steam";
  decryptedLength: number;
  compressedLength: number;
  adler32Hex: string;
  trailerHex: string;
  paddingLength: number;
  encryptedLength: number;
  encryptedFirst64Hex: string;
  encryptedLast64Hex: string;
};

export function encryptSave(yamlContent: string, userId: string, platform: "epic" | "steam"): Promise<Buffer> {
  const yb = Buffer.from(yamlContent, "utf-8");
  return encryptSaveRaw(yb, userId, platform).then((r) => r.encrypted);
}

export function encryptSaveRaw(
  plainBytes: Buffer,
  userId: string,
  platform: "epic" | "steam"
): Promise<{ encrypted: Buffer; debug: EncryptDebug }> {
  const uid = userId.trim();
  if (!uid) return Promise.reject(new Error("User ID cannot be empty"));
  const key = platform === "epic" ? keyEpic(uid) : keySteam(uid);
  return deflateAsync(plainBytes, { level: 9 }).then((comp) => {
    const trailer = Buffer.allocUnsafe(8);
    const chk = adler32(plainBytes);
    if (platform === "epic") {
      trailer.writeUInt32BE(chk, 0);
    } else {
      trailer.writeUInt32LE(chk, 0);
    }
    trailer.writeUInt32LE(plainBytes.length, 4);
    const combined = Buffer.concat([comp, trailer]);
    const padded = padPkcs7(combined, 16);
    const cipher = createCipheriv("aes-256-ecb", key, Buffer.alloc(0));
    cipher.setAutoPadding(false);
    const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
    const padLen = padded.length - combined.length;
    const debug: EncryptDebug = {
      platform,
      decryptedLength: plainBytes.length,
      compressedLength: comp.length,
      adler32Hex: (chk >>> 0).toString(16),
      trailerHex: trailer.toString("hex"),
      paddingLength: padLen,
      encryptedLength: encrypted.length,
      encryptedFirst64Hex: encrypted.subarray(0, 64).toString("hex"),
      encryptedLast64Hex: encrypted.subarray(Math.max(0, encrypted.length - 64)).toString("hex"),
    };
    return { encrypted, debug };
  });
}
