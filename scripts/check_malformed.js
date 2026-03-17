#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const parts = JSON.parse(fs.readFileSync(path.join(ROOT, "api/data/parts.json"), "utf8"));
const CODE_PATTERN = /^\{(\d+):(\d+)\}$/;
const bad = parts.filter(x => !CODE_PATTERN.test(x.code));
console.log("Total parts.json entries:", parts.length);
console.log("Malformed codes:", bad.length);
bad.slice(0, 20).forEach(x => console.log(JSON.stringify(x)));
