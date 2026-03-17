#!/usr/bin/env node
/**
 * Fix incorrectly formatted part codes {xx:xx:yy} -> {xx:yy} using reference data.
 * Uses reference htmls/BL4_master_database.csv (Name -> Code) to get correct codes;
 * falls back to collapsing duplicate: {a:b:c} -> {a:c}.
 * Run from repo root: node scripts/fix_part_codes.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const REF_CSV = path.join(ROOT, "reference htmls", "BL4_master_database.csv");
const UNIVERSAL_DB = path.join(ROOT, "master_search", "db", "universal_parts_db.json");
const PARTS_JSON = path.join(ROOT, "api", "data", "parts.json");

const WRONG_CODE_RE = /^\{\d+:\d+:\d+\}$/;

function parseCsv(content) {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = splitCsvLine(line);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j].trim()] = (vals[j] || "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function loadReferenceNameToCode() {
  if (!fs.existsSync(REF_CSV)) {
    console.warn("Reference CSV not found:", REF_CSV);
    return new Map();
  }
  const content = fs.readFileSync(REF_CSV, "utf8");
  const rows = parseCsv(content);
  const nameToCode = new Map();
  for (const r of rows) {
    const name = (r.Name || "").trim();
    const code = (r.Code || "").trim();
    if (!name || !code) continue;
    // Keep first occurrence when duplicate names (e.g. same part in different contexts)
    if (!nameToCode.has(name)) {
      nameToCode.set(name, code);
    }
  }
  console.log("Loaded", nameToCode.size, "Name -> Code from reference CSV");
  return nameToCode;
}

/** Collapse wrong format {a:b:c} to correct {a:c} */
function collapseCode(code) {
  const m = code.match(/^\{(\d+):\d+:(\d+)\}$/);
  return m ? `{${m[1]}:${m[2]}}` : code;
}

function getCorrectCode(entry, nameToCode) {
  const code = (entry.code || "").trim();
  if (!WRONG_CODE_RE.test(code)) return code;

  const partName = (entry.partName || "").trim();
  const itemType = (entry.itemType || "").trim();
  if (nameToCode.has(partName)) return nameToCode.get(partName);
  if (itemType && nameToCode.has(itemType)) return nameToCode.get(itemType);
  return collapseCode(code);
}

function fixEntries(entries, nameToCode) {
  let fixed = 0;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const code = (entry.code || "").trim();
    if (!WRONG_CODE_RE.test(code)) continue;
    const correct = getCorrectCode(entry, nameToCode);
    if (correct !== code) {
      entry.code = correct;
      fixed++;
    }
  }
  return fixed;
}

function main() {
  const nameToCode = loadReferenceNameToCode();

  // Fix universal_parts_db.json
  if (!fs.existsSync(UNIVERSAL_DB)) {
    console.warn("Not found:", UNIVERSAL_DB);
  } else {
    const data = JSON.parse(fs.readFileSync(UNIVERSAL_DB, "utf8"));
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const n = fixEntries(rows, nameToCode);
    fs.writeFileSync(UNIVERSAL_DB, JSON.stringify(data, null, 2), "utf8");
    console.log("Fixed", n, "codes in", UNIVERSAL_DB);
  }

  // Fix api/data/parts.json
  if (!fs.existsSync(PARTS_JSON)) {
    console.warn("Not found:", PARTS_JSON);
  } else {
    const raw = fs.readFileSync(PARTS_JSON, "utf8");
    const data = JSON.parse(raw);
    const items = Array.isArray(data) ? data : (data.items || []);
    const n = fixEntries(items, nameToCode);
    fs.writeFileSync(PARTS_JSON, JSON.stringify(data, null, 2), "utf8");
    console.log("Fixed", n, "codes in", PARTS_JSON);
  }

  console.log("Done.");
}

main();
