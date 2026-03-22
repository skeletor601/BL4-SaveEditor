#!/usr/bin/env node
/**
 * Sort Backpack by Flags — reads a .sav file, decrypts, and groups items by flag.
 *
 * Usage: node scripts/sort_backpack.js "C:\path\to\Save0001.sav" <steam_or_epic_id>
 *
 * Requires: API running on localhost:3001
 *
 * Flags:
 *   1  = Normal (middle of the road)
 *   3  = Favorite (amazing)
 *   5  = Junk (trash)
 *   17 = Rank 1, 33 = Rank 2, 65 = Rank 3, 129 = Rank 4
 */

const fs = require("fs");
const http = require("http");

const savPath = process.argv[2];
const userId = process.argv[3];

if (!savPath || !userId) {
  console.log("Usage: node scripts/sort_backpack.js <save_file.sav> <steam_or_epic_id>");
  console.log('Example: node scripts/sort_backpack.js "testing/14.sav" 76561199583793080');
  process.exit(1);
}

if (!fs.existsSync(savPath)) {
  console.log("File not found:", savPath);
  process.exit(1);
}

const FLAG_NAMES = {
  1: "Normal",
  3: "FAVORITE",
  5: "JUNK",
  17: "Rank 1",
  33: "Rank 2",
  65: "Rank 3",
  129: "Rank 4",
};

function post(urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: "localhost", port: 3001, path: urlPath, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    }, (res) => {
      let d = "";
      res.on("data", (c) => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// Parse YAML items — extract serial and stateFlags from YAML content
function parseItemsFromYaml(yaml) {
  const items = [];
  // Match item blocks: lines with "serial:" and "state_flags:" or "flags:"
  const lines = yaml.split("\n");
  let currentSerial = null;
  let currentFlags = 1;
  let inBackpack = false;

  for (const line of lines) {
    if (/backpack|equipped|inventory/i.test(line) && line.includes(":")) {
      inBackpack = true;
    }
    const serialMatch = line.match(/serial:\s*['"]?(@U[^\s'"]+)/);
    if (serialMatch) {
      // Save previous item
      if (currentSerial) items.push({ serial: currentSerial, flags: currentFlags });
      currentSerial = serialMatch[1];
      currentFlags = 1; // default
    }
    const flagMatch = line.match(/(?:state_flags|flags|stateFlags):\s*(\d+)/);
    if (flagMatch && currentSerial) {
      currentFlags = Number(flagMatch[1]);
    }
  }
  // Last item
  if (currentSerial) items.push({ serial: currentSerial, flags: currentFlags });
  return items;
}

async function main() {
  console.log("Reading:", savPath);
  const savBase64 = fs.readFileSync(savPath).toString("base64");

  console.log("Decrypting...");
  const result = await post("/api/save/decrypt", { sav_data: savBase64, user_id: userId });

  if (!result.success) {
    console.log("Decrypt failed:", result.error || "unknown");
    process.exit(1);
  }

  const yaml = result.yaml_content;
  if (!yaml) {
    console.log("No YAML content returned");
    process.exit(1);
  }

  console.log("Parsing items from YAML...");
  const items = parseItemsFromYaml(yaml);
  console.log(`Found ${items.length} items`);

  if (!items.length) {
    console.log("No items found in save");
    process.exit(0);
  }

  // Decode serials
  console.log("Decoding serials...");
  const serials = items.map((it) => it.serial);
  const decResult = await post("/api/save/decode-items", { serials });
  const decoded = decResult.items || [];

  // Group by flag
  const byFlag = {};
  items.forEach((item, i) => {
    const flag = item.flags;
    if (!byFlag[flag]) byFlag[flag] = [];
    const dec = decoded[i] || {};
    byFlag[flag].push({
      name: dec.name || dec.itemType || "Unknown",
      itemType: dec.itemType || "?",
      manufacturer: dec.manufacturer || "?",
      level: dec.level || "?",
      serial: item.serial,
      decoded: dec.decodedFull || "",
    });
  });

  // Print grouped results
  const flagOrder = [3, 1, 17, 33, 65, 129, 5];
  const outputLines = [];

  for (const flag of flagOrder) {
    const flagItems = byFlag[flag];
    if (!flagItems || !flagItems.length) continue;
    const label = FLAG_NAMES[flag] || `Flag ${flag}`;
    const header = `\n${"=".repeat(60)}\n  ${label} (${flagItems.length} items)\n${"=".repeat(60)}`;
    console.log(header);
    outputLines.push(header);

    flagItems.forEach((it, i) => {
      const line1 = `  ${i + 1}. [${it.itemType}] ${it.name} (Lv${it.level} ${it.manufacturer})`;
      console.log(line1);
      outputLines.push(line1);

      if (it.decoded) {
        const dec = `     Decoded: ${it.decoded}`;
        console.log(dec);
        outputLines.push(dec);
      }

      const ser = `     Serial: ${it.serial}`;
      console.log(ser);
      outputLines.push(ser);

      console.log();
      outputLines.push("");
    });
  }

  // Save to file
  const outPath = savPath.replace(/\.sav$/i, "_sorted.txt");
  fs.writeFileSync(outPath, outputLines.join("\n"), "utf-8");
  console.log(`\nSaved to: ${outPath}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
