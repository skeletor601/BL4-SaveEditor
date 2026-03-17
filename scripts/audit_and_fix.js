#!/usr/bin/env node
/**
 * Steps 2-6: Audit and fix database files
 * - Inventory all database files with item codes
 * - Validate and fix malformed codes
 * - Deduplicate entries
 * - Cross-reference with reference codes
 * - Save audit report
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CODE_PATTERN = /^\{(\d+):(\d+)\}$/;

const log = [];
function L(msg) { console.log(msg); log.push(msg); }

// ── Load reference codes ───────────────────────────────────────────────────

L("=== Step 2-6: Database Audit and Fix ===\n");

const refCodesFile = path.join(__dirname, "reference_codes.json");
const refCodes = new Set(JSON.parse(fs.readFileSync(refCodesFile, "utf8")));
L(`Reference codes loaded: ${refCodes.size}`);

// Load detailed reference data
const refDetailsArr = JSON.parse(fs.readFileSync(path.join(__dirname, "reference_codes_details.json"), "utf8"));
const refDetails = {};
for (const r of refDetailsArr) { refDetails[r.code] = r; }

// ── Helper: try to fix a malformed code ───────────────────────────────────

function tryFixCode(code) {
  if (!code || typeof code !== "string") return { fixed: null, reason: "null/non-string code" };
  const trimmed = code.trim();
  if (!trimmed) return { fixed: null, reason: "empty code" };

  // Already valid
  if (CODE_PATTERN.test(trimmed)) return { fixed: trimmed, reason: "already valid" };

  // Try to extract typeId:partId from various malformed forms:
  // { 234:1}, {234 :1}, {234: 1}, {234:1 }, {234: [1]}, {234:[1]}, etc.

  // Remove outer braces and whitespace
  let inner = trimmed;
  if (inner.startsWith("{")) inner = inner.slice(1);
  if (inner.endsWith("}")) inner = inner.slice(0, -1);
  inner = inner.trim();

  // Handle multi-part format like "[1 2 3]" — pick first part only
  // {typeId:[partId1 partId2 ...]} -> fix to {typeId:partId1}
  const multiMatch = inner.match(/^(\d+)\s*:\s*\[(\d+)(?:\s+\d+)*\]$/);
  if (multiMatch) {
    return { fixed: `{${multiMatch[1]}:${multiMatch[2]}}`, reason: `multi-part -> first part: ${code}` };
  }

  // Remove any brackets around partId: {typeId:[partId]}
  inner = inner.replace(/\[(\d+)\]/, "$1");

  // Extract two numbers separated by colon (with optional spaces around colon)
  const colonMatch = inner.match(/^(\d+)\s*:\s*(\d+)$/);
  if (colonMatch) {
    const typeId = parseInt(colonMatch[1]);
    const partId = parseInt(colonMatch[2]);
    if (typeId > 0 && partId > 0) {
      return { fixed: `{${typeId}:${partId}}`, reason: `fixed whitespace: ${code}` };
    }
  }

  // Leading zeros: {234:01} -> {234:1}
  const leadingZeroMatch = inner.match(/^(\d+)\s*:\s*0+(\d+)$/);
  if (leadingZeroMatch) {
    return { fixed: `{${parseInt(leadingZeroMatch[1])}:${parseInt(leadingZeroMatch[2])}}`, reason: `fixed leading zeros: ${code}` };
  }

  return { fixed: null, reason: `unrecoverable: ${code}` };
}

// ── Process a database file (array of entries with .code field) ────────────

function processEntries(entries, fileName) {
  L(`\n--- Processing: ${fileName} ---`);
  L(`  Total entries: ${entries.length}`);

  let fixedCount = 0;
  let unrecoverableCount = 0;
  const fixLog = [];
  const unrecoverableLog = [];

  // Fix malformed codes
  for (const entry of entries) {
    if (!CODE_PATTERN.test(entry.code)) {
      const { fixed, reason } = tryFixCode(entry.code);
      if (fixed) {
        fixLog.push(`  FIX: "${entry.code}" -> "${fixed}" (${reason})`);
        entry.code = fixed;
        fixedCount++;
      } else {
        unrecoverableLog.push(`  UNRECOVERABLE: code="${entry.code}" name="${entry.partName || entry.name || ""}" reason="${reason}"`);
        entry._invalid = true;
        unrecoverableCount++;
      }
    }
  }

  L(`  Malformed codes fixed: ${fixedCount}`);
  for (const l of fixLog) L(l);
  L(`  Unrecoverable codes: ${unrecoverableCount}`);
  for (const l of unrecoverableLog) L(l);

  // Deduplicate: prefer entry with more data
  const byCode = new Map();
  for (const entry of entries) {
    if (entry._invalid) continue;
    const code = entry.code;
    if (!byCode.has(code)) {
      byCode.set(code, entry);
    } else {
      // Prefer entry with longer effect/description text
      const existing = byCode.get(code);
      const existingScore = scoreEntry(existing);
      const newScore = scoreEntry(entry);
      if (newScore > existingScore) {
        byCode.set(code, entry);
      }
    }
  }

  const dupeCount = entries.filter(e => !e._invalid).length - byCode.size;
  L(`  Duplicates removed: ${dupeCount}`);

  const result = Array.from(byCode.values());
  L(`  Final entry count: ${result.length}`);
  return result;
}

function scoreEntry(entry) {
  // Score by total text length (more data = better)
  let score = 0;
  for (const v of Object.values(entry)) {
    if (typeof v === "string") score += v.length;
  }
  return score;
}

// ── Step 2: Inventory database files ─────────────────────────────────────

L("\n=== STEP 2: Database Inventory ===");

const DB_FILES = [
  { path: "api/data/parts.json", type: "array" },
  { path: "master_search/db/universal_parts_db.json", type: "wrapped" },
];

// Check for other JSON/CSV files with codes
const OTHER_SCAN = [
  "master_search/db/",
];

L("Primary database files:");
for (const db of DB_FILES) {
  const full = path.join(ROOT, db.path);
  if (fs.existsSync(full)) {
    const stat = fs.statSync(full);
    L(`  ${db.path} (${Math.round(stat.size/1024)} KB)`);
  } else {
    L(`  ${db.path} -- MISSING`);
  }
}

// ── Step 3-4: Fix malformed codes, Step 5: Deduplicate ───────────────────

L("\n=== STEPS 3-5: Validate, Fix, Deduplicate ===");

// Process parts.json
const partsJsonPath = path.join(ROOT, "api/data/parts.json");
const partsJsonRaw = JSON.parse(fs.readFileSync(partsJsonPath, "utf8"));
const partsJsonFixed = processEntries(partsJsonRaw, "api/data/parts.json");
fs.writeFileSync(partsJsonPath, JSON.stringify(partsJsonFixed, null, 2), "utf8");
L(`  Saved ${partsJsonFixed.length} entries to api/data/parts.json`);

// Process universal_parts_db.json
const udbPath = path.join(ROOT, "master_search/db/universal_parts_db.json");
const udbRaw = JSON.parse(fs.readFileSync(udbPath, "utf8"));
const udbFixed = processEntries(udbRaw.rows, "master_search/db/universal_parts_db.json");
udbRaw.rows = udbFixed;
udbRaw.fixed_at_utc = new Date().toISOString();
fs.writeFileSync(udbPath, JSON.stringify(udbRaw, null, 2), "utf8");
L(`  Saved ${udbFixed.length} rows to master_search/db/universal_parts_db.json`);

// ── Step 6: Cross-reference ────────────────────────────────────────────────

L("\n=== STEP 6: Cross-Reference with Reference HTML Codes ===");

// Build sets from both DBs
const partsJsonCodes = new Set(partsJsonFixed.map(e => e.code));
const udbCodes = new Set(udbFixed.map(e => e.code));
const allDbCodes = new Set([...partsJsonCodes, ...udbCodes]);

L(`\nCode counts:`);
L(`  Reference HTML codes: ${refCodes.size}`);
L(`  api/data/parts.json codes: ${partsJsonCodes.size}`);
L(`  universal_parts_db.json codes: ${udbCodes.size}`);
L(`  Union of both DBs: ${allDbCodes.size}`);

// Missing from DBs (in ref but not in any DB)
const missingFromDbs = [];
for (const code of refCodes) {
  if (!allDbCodes.has(code)) {
    missingFromDbs.push(code);
  }
}
missingFromDbs.sort((a, b) => {
  const [ta, ia] = a.replace(/[{}]/g, "").split(":").map(Number);
  const [tb, ib] = b.replace(/[{}]/g, "").split(":").map(Number);
  if (ta !== tb) return ta - tb;
  return ia - ib;
});

L(`\nCodes in reference HTML but NOT in any database: ${missingFromDbs.length}`);

// Extra in DBs (in DB but not in ref HTML)
const extraInDbs = [];
for (const code of allDbCodes) {
  if (!refCodes.has(code)) {
    extraInDbs.push(code);
  }
}
extraInDbs.sort((a, b) => {
  const [ta, ia] = a.replace(/[{}]/g, "").split(":").map(Number);
  const [tb, ib] = b.replace(/[{}]/g, "").split(":").map(Number);
  if (ta !== tb) return ta - tb;
  return ia - ib;
});

L(`Codes in databases but NOT in reference HTML (extra): ${extraInDbs.length}`);

// Check differences between parts.json and universal_parts_db
const onlyInPartsJson = [];
const onlyInUdb = [];
for (const code of partsJsonCodes) { if (!udbCodes.has(code)) onlyInPartsJson.push(code); }
for (const code of udbCodes) { if (!partsJsonCodes.has(code)) onlyInUdb.push(code); }

L(`\nCodes only in parts.json (not in universal_parts_db): ${onlyInPartsJson.length}`);
L(`Codes only in universal_parts_db (not in parts.json): ${onlyInUdb.length}`);

// ── Build report ────────────────────────────────────────────────────────────

const reportLines = [
  "=== BL4 AIO Web — Code Audit Report ===",
  `Generated: ${new Date().toISOString()}`,
  "",
  "── SUMMARY ──",
  `Reference HTML codes: ${refCodes.size}`,
  `api/data/parts.json codes: ${partsJsonCodes.size}`,
  `universal_parts_db.json codes: ${udbCodes.size}`,
  `Union of both DBs: ${allDbCodes.size}`,
  "",
  `Codes in ref HTML but NOT in any DB (missing): ${missingFromDbs.length}`,
  `Codes in DBs but NOT in ref HTML (extra - OK from other sources): ${extraInDbs.length}`,
  `Codes only in parts.json: ${onlyInPartsJson.length}`,
  `Codes only in universal_parts_db: ${onlyInUdb.length}`,
  "",
  "── MISSING CODES (in ref HTML but not in any DB) ──",
];

for (const code of missingFromDbs) {
  const detail = refDetails[code];
  const name = detail ? (detail.name || "") : "";
  reportLines.push(`  ${code}  ${name}`);
}

reportLines.push("");
reportLines.push("── EXTRA CODES (in DBs but not in ref HTML — from other sources, OK) ──");

for (const code of extraInDbs.slice(0, 200)) {
  const entry = partsJsonFixed.find(e => e.code === code) || udbFixed.find(e => e.code === code);
  const name = entry ? (entry.partName || entry.name || entry.itemType || "") : "";
  reportLines.push(`  ${code}  ${name}`);
}
if (extraInDbs.length > 200) {
  reportLines.push(`  ... and ${extraInDbs.length - 200} more`);
}

reportLines.push("");
reportLines.push("── CODES ONLY IN parts.json ──");
for (const code of onlyInPartsJson.slice(0, 50)) {
  const entry = partsJsonFixed.find(e => e.code === code);
  reportLines.push(`  ${code}  ${entry ? (entry.partName || entry.itemType || "") : ""}`);
}

reportLines.push("");
reportLines.push("── CODES ONLY IN universal_parts_db ──");
for (const code of onlyInUdb.slice(0, 50)) {
  const entry = udbFixed.find(e => e.code === code);
  reportLines.push(`  ${code}  ${entry ? (entry.partName || entry.itemType || "") : ""}`);
}

reportLines.push("");
reportLines.push("── FULL AUDIT LOG ──");
reportLines.push(...log);

const reportPath = path.join(__dirname, "code_audit_report.txt");
fs.writeFileSync(reportPath, reportLines.join("\n"), "utf8");
L(`\nAudit report saved to ${reportPath}`);
L("\n=== AUDIT COMPLETE ===");
