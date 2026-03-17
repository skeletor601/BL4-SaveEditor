#!/usr/bin/env node
/**
 * Scrape full skill data (name, type, description, stats) from Maxroll BL4 Planner
 * for all 4 characters. Uses Puppeteer; the planner is client-rendered.
 *
 * Run from repo root:
 *   cd scripts && npm install && node scrape_maxroll_skills.js
 *
 * Output: class_mods/Amon_skills_full.json, Harlowe_skills_full.json, etc.
 * Schema: [{ name, type, description, stats: string[] }, ...]
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "class_mods");
const PLANNER_URL = "https://maxroll.gg/borderlands-4/planner";

const CHARACTERS = ["Vex", "Rafa", "Harlowe", "Amon"];

// Ensure puppeteer is available
let browser;
async function getBrowser() {
  if (browser) return browser;
  try {
    const puppeteer = require("puppeteer");
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    return browser;
  } catch (e) {
    console.error("Install puppeteer first: cd scripts && npm install");
    throw e;
  }
}

/**
 * Parse tooltip/card text into { name, type, description, stats }.
 * Expected shape: first line = name, second = type (e.g. "Passive"), then description, then stat lines like "X: Y".
 */
function parseSkillCardText(fullText) {
  const lines = (fullText || "")
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return { name: "", type: "", description: "", stats: [] };

  const name = lines[0] || "";
  const type = lines[1] || "";
  // Description: everything until we hit a line that looks like "Label: Value" (stat)
  const statLike = /^[^:]+:\s*.+$/;
  let i = 2;
  const descParts = [];
  while (i < lines.length && !statLike.test(lines[i])) {
    descParts.push(lines[i]);
    i++;
  }
  const description = descParts.join(" ").trim();
  const stats = [];
  while (i < lines.length) {
    if (statLike.test(lines[i])) stats.push(lines[i]);
    i++;
  }
  return { name, type, description, stats };
}

/**
 * Extract skill data from the page for the current character.
 * Tries: (1) data from intercepted API, (2) click each skill node and read tooltip.
 */
async function extractSkillsForCurrentCharacter(page) {
  const skills = [];
  const seenNames = new Set();

  // Strategy 1: Look for any element that looks like a skill tooltip/card (already in DOM or after hover)
  const cardSelectors = [
    '[role="tooltip"]',
    '[class*="tooltip"]',
    '[class*="Tooltip"]',
    '[class*="skill-card"]',
    '[class*="SkillCard"]',
    '[data-skill-name]',
    '.skill-description',
    '[class*="description"]',
  ];

  // Strategy 2: Find clickable skill nodes (common patterns)
  const nodeSelectors = [
    'button[class*="skill"]',
    '[class*="skill-node"]',
    '[class*="SkillNode"]',
    '[data-skill-id]',
    'a[href*="skill"]',
    '[class*="talent"]',
    '[class*="Talent"]',
    'button[class*="node"]',
    '[role="button"]',
  ];

  await page.evaluate(() => {
    // Scroll skill area into view so elements are in DOM
    const scroll = (el) => {
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "instant", block: "center" });
    };
    const tree = document.querySelector("[class*='tree']") || document.querySelector("[class*='Tree']") || document.body;
    scroll(tree);
  });

  // Get all possible node elements
  let nodes = [];
  for (const sel of nodeSelectors) {
    try {
      const el = await page.$$(sel);
      if (el.length > 0) nodes.push(...el);
    } catch (_) {}
  }

  // Dedupe by same element handle
  const nodeHandles = new Set();
  const uniq = [];
  for (const n of nodes) {
    try {
      const id = await n.evaluate((el) => el.id || el.className + el.textContent?.slice(0, 30));
      if (!nodeHandles.has(id)) {
        nodeHandles.add(id);
        uniq.push(n);
      }
    } catch (_) {}
  }

  // Limit to a reasonable number (skill trees often have 50–100 nodes)
  const toClick = uniq.slice(0, 120);
  for (let i = 0; i < toClick.length; i++) {
    try {
      const handle = toClick[i];
      await handle.click();
      await new Promise((r) => setTimeout(r, 300));

      let cardText = "";
      for (const sel of cardSelectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            cardText = await el.evaluate((e) => e.innerText || e.textContent || "");
            if (cardText.length > 10 && cardText.length < 2000) break;
          }
        } catch (_) {}
      }
      if (!cardText) {
        // Fallback: any visible popover/tooltip
        cardText = await page.evaluate(() => {
          const pop = document.querySelector("[class*='popover']") || document.querySelector("[class*='Popover']") || document.querySelector("[class*='modal']");
          return pop ? (pop.innerText || pop.textContent || "").trim() : "";
        });
      }
      if (cardText) {
        const parsed = parseSkillCardText(cardText);
        if (parsed.name && !seenNames.has(parsed.name)) {
          seenNames.add(parsed.name);
          skills.push(parsed);
        }
      }
    } catch (e) {
      // Skip failed node
    }
  }

  return skills;
}

/**
 * Try to switch planner to a character (by name). Depends on site UI.
 */
async function selectCharacter(page, characterName) {
  const clicked = await page.evaluate((name) => {
    const all = document.querySelectorAll("button, a, [role='tab'], [role='button'], [class*='character'], [class*='Character']");
    const n = name.toLowerCase();
    for (const el of all) {
      const t = (el.textContent || "").trim().toLowerCase();
      if (t === n || t.startsWith(n + " ") || t.endsWith(" " + n)) {
        el.click();
        return true;
      }
    }
    return false;
  }, characterName);
  if (clicked) await new Promise((r) => setTimeout(r, 800));
  return clicked;
}

async function main() {
  console.log("Launching browser...");
  const b = await getBrowser();
  const page = await b.newPage();

  // Capture JSON responses in case the app loads skill data via API
  const capturedJson = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (!url || !/\.json|api|graphql|data/i.test(url)) return;
    try {
      const text = await response.text();
      if (text.length > 100 && text.length < 500000) {
        try {
          const data = JSON.parse(text);
          if (data && (data.skills || data.tree || Array.isArray(data))) capturedJson.push({ url, data });
        } catch (_) {}
      }
    } catch (_) {}
  });

  await page.setViewport({ width: 1400, height: 900 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  console.log("Loading planner...");
  await page.goto(PLANNER_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 5000));

  // Save HTML for debugging selectors (inspect class names / structure)
  const htmlPath = path.join(OUT_DIR, "_maxroll_planner_snapshot.html");
  const html = await page.content();
  fs.writeFileSync(htmlPath, html, "utf8");
  console.log("Saved page snapshot to", htmlPath);

  const allData = {};
  for (const char of CHARACTERS) {
    console.log(`\n--- ${char} ---`);
    const selected = await selectCharacter(page, char);
    if (!selected) {
      console.log(`  Could not select ${char}; skipping or using default view.`);
    }
    await new Promise((r) => setTimeout(r, 1000));
    const skills = await extractSkillsForCurrentCharacter(page);
    if (skills.length > 0) {
      allData[char] = skills;
      console.log(`  Collected ${skills.length} skills.`);
    } else {
      allData[char] = [];
      console.log(`  No skills extracted for ${char}.`);
    }
  }

  await b.close();
  browser = null;

  // Merge with existing *_en.json so we keep name/type/description and add stats where we got them
  const existingFiles = { Amon: "Amon_en.json", Harlowe: "Harlowe_en.json", Rafa: "Rafa_en.json", Vex: "Vex_en.json" };
  for (const char of CHARACTERS) {
    const scraped = allData[char] || [];
    let existing = [];
    const existingPath = path.join(OUT_DIR, existingFiles[char]);
    if (fs.existsSync(existingPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(existingPath, "utf8"));
      } catch (_) {}
    }
    const byName = new Map(existing.map((s) => [s.name, { ...s, stats: s.stats || [] }]));
    for (const s of scraped) {
      if (!s.name) continue;
      const current = byName.get(s.name);
      if (current) {
        if (s.stats && s.stats.length > 0) current.stats = s.stats;
        if (s.description) current.description = s.description;
        if (s.type) current.type = s.type;
      } else {
        byName.set(s.name, { name: s.name, type: s.type, description: s.description, stats: s.stats || [] });
      }
    }
    const merged = Array.from(byName.values());
    const outPath = path.join(OUT_DIR, `${char}_skills_full.json`);
    fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), "utf8");
    console.log(`Wrote ${outPath} (${merged.length} skills).`);
  }

  if (capturedJson.length > 0) {
    const rawPath = path.join(OUT_DIR, "_maxroll_captured_json.json");
    fs.writeFileSync(rawPath, JSON.stringify(capturedJson, null, 2), "utf8");
    console.log(`\nAlso saved ${capturedJson.length} captured API responses to ${rawPath}`);
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  if (browser) browser.close();
  process.exit(1);
});
