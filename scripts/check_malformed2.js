#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

// Check universal_parts_db
const db = JSON.parse(fs.readFileSync(path.join(ROOT, "master_search/db/universal_parts_db.json"), "utf8"));
const parts = db.rows;
const CODE_PATTERN = /^\{(\d+):(\d+)\}$/;
const bad = parts.filter(x => !CODE_PATTERN.test(x.code));
console.log("Total universal_parts_db rows:", parts.length);
console.log("Malformed codes:", bad.length);
bad.slice(0, 20).forEach(x => console.log(JSON.stringify(x)));

// Also check for duplicates
const codeCount = {};
for (const p of parts) {
  codeCount[p.code] = (codeCount[p.code] || 0) + 1;
}
const dupes = Object.entries(codeCount).filter(([,c]) => c > 1);
console.log("\nDuplicate codes:", dupes.length);
dupes.slice(0, 10).forEach(([code, count]) => console.log(`  ${code}: ${count} times`));
