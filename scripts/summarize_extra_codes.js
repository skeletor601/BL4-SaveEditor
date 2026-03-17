#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const refCodes = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, "reference_codes.json"), "utf8")));
const parts = JSON.parse(fs.readFileSync(path.join(ROOT, "api/data/parts.json"), "utf8"));
const allDbCodes = new Set(parts.map(p => p.code));

const extra = [...allDbCodes].filter(c => !refCodes.has(c));

// Group by category
const byCat = {};
for (const code of extra) {
  const entry = parts.find(p => p.code === code);
  const cat = entry ? (entry.category || "Unknown") : "Unknown";
  byCat[cat] = (byCat[cat] || 0) + 1;
}

console.log("Extra codes (in DB but not in ref HTML) by category:");
for (const [cat, count] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`);
}
console.log("Total extra:", extra.length);
