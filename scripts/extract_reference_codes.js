#!/usr/bin/env node
/**
 * Step 1: Extract reference item codes from the reference HTML file.
 * The HTML contains EMBEDDED_GAME_DATA_BASE64 - a base64+zlib-compressed JSON blob
 * containing the full parts database. We extract it, decompress, and extract all
 * {typeId:partId} codes.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const HTML_FILE = path.join(ROOT, "trash/reference htmls/Borderlands Item Editor and Save Editor.html");
const OUT_FILE = path.join(__dirname, "reference_codes.json");

console.log("Reading reference HTML...");
const html = fs.readFileSync(HTML_FILE, "utf8");

// Extract the EMBEDDED_GAME_DATA_BASE64 value
// It's defined as: const EMBEDDED_GAME_DATA_BASE64 = "...base64...";
const match = html.match(/const EMBEDDED_GAME_DATA_BASE64\s*=\s*["']([A-Za-z0-9+/=]+)["']/);
if (!match) {
  console.error("ERROR: Could not find EMBEDDED_GAME_DATA_BASE64 in HTML");
  process.exit(1);
}

const base64Data = match[1];
console.log(`Found base64 data, length: ${base64Data.length} chars`);

// Decompress
let gameData;
try {
  const compressedBytes = Buffer.from(base64Data, "base64");
  console.log(`Compressed bytes: ${compressedBytes.length}`);
  const decompressed = zlib.inflateRawSync(compressedBytes);
  console.log(`Decompressed bytes: ${decompressed.length}`);
  gameData = JSON.parse(decompressed.toString("utf8"));
  console.log("Successfully parsed game data JSON");
} catch (e1) {
  console.log("inflateRaw failed, trying inflate...");
  try {
    const compressedBytes = Buffer.from(base64Data, "base64");
    const decompressed = zlib.inflateSync(compressedBytes);
    gameData = JSON.parse(decompressed.toString("utf8"));
    console.log("Successfully parsed with inflate");
  } catch (e2) {
    console.log("inflate failed, trying gunzip...");
    try {
      const compressedBytes = Buffer.from(base64Data, "base64");
      const decompressed = zlib.gunzipSync(compressedBytes);
      gameData = JSON.parse(decompressed.toString("utf8"));
      console.log("Successfully parsed with gunzip");
    } catch (e3) {
      console.error("All decompression methods failed:");
      console.error("inflateRaw:", e1.message);
      console.error("inflate:", e2.message);
      console.error("gunzip:", e3.message);
      process.exit(1);
    }
  }
}

// Inspect structure
const keys = Object.keys(gameData);
console.log("Top-level keys:", keys.slice(0, 20));

// Extract all {typeId:partId} codes by traversing the data
const codesSet = new Set();
const codeDetails = {}; // code -> { name, effect, ... }

function extractCodes(obj, path = "") {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      extractCodes(obj[i], `${path}[${i}]`);
    }
    return;
  }

  // Check if this object looks like a part entry with typeId and id
  if (obj.typeId !== undefined && obj.id !== undefined) {
    const typeId = parseInt(obj.typeId);
    const id = parseInt(obj.id);
    if (!isNaN(typeId) && !isNaN(id) && typeId > 0 && id > 0) {
      const code = `{${typeId}:${id}}`;
      codesSet.add(code);
      codeDetails[code] = {
        code,
        typeId,
        id,
        name: obj.name || obj.label || obj.partName || "",
        effect: obj.effect || obj.description || obj.desc || "",
        path
      };
    }
  }

  // Also check for fullId in "typeId:partId" format
  if (typeof obj.fullId === "string" && /^\d+:\d+$/.test(obj.fullId)) {
    const [typeId, id] = obj.fullId.split(":").map(Number);
    if (!isNaN(typeId) && !isNaN(id) && typeId > 0 && id > 0) {
      const code = `{${typeId}:${id}}`;
      codesSet.add(code);
      if (!codeDetails[code]) {
        codeDetails[code] = {
          code,
          typeId,
          id,
          name: obj.name || obj.label || obj.partName || "",
          effect: obj.effect || obj.description || obj.desc || "",
          path
        };
      }
    }
  }

  for (const key of Object.keys(obj)) {
    extractCodes(obj[key], `${path}.${key}`);
  }
}

console.log("Extracting codes from game data...");
extractCodes(gameData);

// Also check id_index if present
if (gameData.id_index) {
  console.log("Found id_index with", Object.keys(gameData.id_index).length, "entries");
  for (const key of Object.keys(gameData.id_index)) {
    // id_index keys are in format "typeId:partId"
    if (/^\d+:\d+$/.test(key)) {
      const [typeId, id] = key.split(":").map(Number);
      if (!isNaN(typeId) && !isNaN(id) && typeId > 0 && id > 0) {
        const code = `{${typeId}:${id}}`;
        codesSet.add(code);
        if (!codeDetails[code]) {
          codeDetails[code] = { code, typeId, id, name: "", effect: "", path: `id_index.${key}` };
        }
      }
    }
  }
}

console.log(`Extracted ${codesSet.size} unique codes`);

// Sort codes numerically
const sortedCodes = Array.from(codesSet).sort((a, b) => {
  const [ta, ia] = a.replace(/[{}]/g, "").split(":").map(Number);
  const [tb, ib] = b.replace(/[{}]/g, "").split(":").map(Number);
  if (ta !== tb) return ta - tb;
  return ia - ib;
});

// Save just the code strings
fs.writeFileSync(OUT_FILE, JSON.stringify(sortedCodes, null, 2), "utf8");
console.log(`Saved ${sortedCodes.length} reference codes to ${OUT_FILE}`);

// Also save detailed version
const detailsFile = path.join(__dirname, "reference_codes_details.json");
fs.writeFileSync(detailsFile, JSON.stringify(Object.values(codeDetails).sort((a, b) => {
  if (a.typeId !== b.typeId) return a.typeId - b.typeId;
  return a.id - b.id;
}), null, 2), "utf8");
console.log(`Saved detailed codes to ${detailsFile}`);

// Show sample
console.log("\nSample codes:", sortedCodes.slice(0, 10));
console.log("...");
console.log("Last 10:", sortedCodes.slice(-10));
