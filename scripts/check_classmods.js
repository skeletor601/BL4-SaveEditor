#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const files = ["Amon_skills_full.json","Harlowe_skills_full.json","Rafa_skills_full.json","Vex_skills_full.json"];
for(const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "class_mods", f), "utf8"));
  console.log(`\n${f}: ${data.length} entries`);
  console.log("Sample:", JSON.stringify(data.slice(0,2), null, 2));
}
