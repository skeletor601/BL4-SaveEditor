#!/usr/bin/env node
/**
 * Scrape skill names and descriptions from Game8's List of All Skills and Skill Trees.
 * Page: https://game8.co/games/Borderlands-4/archives/546341
 * Table columns: Skill (link), Vault Hunter, Tree and Effect (description).
 *
 * Run from repo root:
 *   cd scripts && npm install && node scrape_game8_skills.js
 *
 * Merges into class_mods/Amon_skills_full.json, Harlowe_skills_full.json, etc.
 * Updates description for each skill; keeps existing name, type, stats.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "class_mods");
const GAME8_URL = "https://game8.co/games/Borderlands-4/archives/546341";

const CHARACTERS = ["Amon", "Harlowe", "Rafa", "Vex"];

function trim(str) {
  return (str || "").trim().replace(/\s+/g, " ").trim();
}

/**
 * Fetch HTML and parse skills table with cheerio.
 * Returns { Amon: [{ name, description }], ... }
 */
async function fetchAndParseGame8() {
  const res = await fetch(GAME8_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`Game8 fetch failed: ${res.status} ${res.statusText}`);
  const html = await res.text();

  let $;
  try {
    $ = require("cheerio").load(html);
  } catch (e) {
    console.error("Install cheerio: cd scripts && npm install");
    throw e;
  }

  const byChar = { Amon: [], Harlowe: [], Rafa: [], Vex: [] };

  // Table: Skill | Vault Hunter | Tree and Effect
  $("table tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 3) return;

    const link = $(cells[0]).find("a").first();
    const name = trim(link.text());
    const char = trim($(cells[1]).text());
    const description = trim($(cells[2]).text());

    if (!name || !char || !CHARACTERS.includes(char)) return;

    if (!byChar[char]) byChar[char] = [];
    byChar[char].push({ name, description });
  });

  // Some pages use thead + tbody; some use a single table with header row. Skip header.
  $("table tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 3) return;

    const link = $(cells[0]).find("a").first();
    const name = trim(link.text());
    const char = trim($(cells[1]).text());
    const description = trim($(cells[2]).text());

    if (!name || !char || !CHARACTERS.includes(char)) return;

    const list = byChar[char];
    if (list.some((s) => s.name === name)) return; // already from tbody
    list.push({ name, description });
  });

  return byChar;
}

/**
 * Merge Game8 data into existing *_skills_full.json.
 * Match by name; update description only (keep type and stats).
 */
function mergeIntoFull(byChar) {
  for (const char of CHARACTERS) {
    const fullPath = path.join(OUT_DIR, `${char}_skills_full.json`);
    let existing = [];
    if (fs.existsSync(fullPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      } catch (e) {
        console.warn(`Could not read ${fullPath}:`, e.message);
      }
    }

    const game8List = byChar[char] || [];
    const byName = new Map(game8List.map((s) => [s.name, s.description]));

    let updated = 0;
    const merged = existing.map((skill) => {
      const desc = byName.get(skill.name);
      if (desc && desc !== skill.description) {
        updated++;
        return { ...skill, description: desc };
      }
      return skill;
    });

    // Append any Game8 skills not in existing list (e.g. new skills)
    for (const s of game8List) {
      if (!existing.some((e) => e.name === s.name)) {
        merged.push({
          name: s.name,
          type: "Passive",
          description: s.description,
          stats: [],
        });
        updated++;
      }
    }

    fs.writeFileSync(fullPath, JSON.stringify(merged, null, 2), "utf8");
    console.log(`${char}: ${merged.length} skills, ${updated} descriptions updated from Game8.`);
  }
}

async function main() {
  console.log("Fetching Game8 skills page...");
  const byChar = await fetchAndParseGame8();

  const total = CHARACTERS.reduce((n, c) => n + (byChar[c]?.length || 0), 0);
  console.log(`Parsed ${total} skill rows (${CHARACTERS.map((c) => `${c}: ${(byChar[c] || []).length}`).join(", ")}).`);

  console.log("\nMerging into class_mods/*_skills_full.json...");
  mergeIntoFull(byChar);
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
