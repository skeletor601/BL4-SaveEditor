#!/usr/bin/env node
/**
 * Scrape skill data (name, type, description, stats) from Mobalytics BL4 Build Planner.
 * https://mobalytics.gg/borderlands-4/planner/builds
 * Uses Puppeteer; merges results into class_mods/*_skills_full.json (adds stats where found).
 *
 * Run: cd scripts && node scrape_mobalytics_skills.js
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "class_mods");
const PLANNER_URL = "https://mobalytics.gg/borderlands-4/planner/builds";

const CHARACTERS = ["Vex", "Rafa", "Amon", "Harlowe"];

let browser;
async function getBrowser() {
  if (browser) return browser;
  const puppeteer = require("puppeteer");
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  return browser;
}

function parseSkillCardText(fullText) {
  const lines = (fullText || "")
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return { name: "", type: "", description: "", stats: [] };
  const name = lines[0] || "";
  const type = lines[1] || "";
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

async function extractSkillsForCurrentCharacter(page) {
  const skills = [];
  const seenNames = new Set();
  const cardSelectors = [
    '[role="tooltip"]',
    '[class*="tooltip"]',
    '[class*="Tooltip"]',
    '[class*="skill-card"]',
    '[class*="SkillCard"]',
    '[class*="skill-description"]',
    '[data-skill-name]',
    '[class*="description"]',
    '[class*="popover"]',
    '[class*="Popover"]',
  ];
  const nodeSelectors = [
    '[class*="skill-node"]',
    '[class*="SkillNode"]',
    '[class*="skillNode"]',
    '[data-skill-id]',
    '[data-testid*="skill"]',
    'button[class*="skill"]',
    '[class*="talent"]',
    'button[class*="node"]',
    '[class*="tree"] button',
    '[class*="Tree"] button',
  ];

  await page.evaluate(() => {
    const skillTree = document.querySelector("[id*='skill-tree']") || document.querySelector("[class*='SkillTree']") || document.querySelector("section");
    if (skillTree) skillTree.scrollIntoView({ behavior: "instant", block: "center" });
  });
  await new Promise((r) => setTimeout(r, 500));

  let nodes = [];
  for (const sel of nodeSelectors) {
    try {
      const el = await page.$$(sel);
      if (el.length > 0) nodes.push(...el);
    } catch (_) {}
  }
  const seen = new Set();
  const uniq = [];
  for (const n of nodes) {
    try {
      const id = await n.evaluate((el) => (el.id || "") + (el.className || "") + (el.getAttribute("data-testid") || "") + (el.textContent || "").slice(0, 40));
      if (!seen.has(id)) {
        seen.add(id);
        uniq.push(n);
      }
    } catch (_) {}
  }

  const toClick = uniq.slice(0, 150);
  for (let i = 0; i < toClick.length; i++) {
    try {
      await toClick[i].click();
      await new Promise((r) => setTimeout(r, 350));
      let cardText = "";
      for (const sel of cardSelectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            cardText = await el.evaluate((e) => e.innerText || e.textContent || "");
            if (cardText.length > 8 && cardText.length < 3000) break;
          }
        } catch (_) {}
      }
      if (!cardText) {
        cardText = await page.evaluate(() => {
          const sel = document.querySelector("[class*='popover']") || document.querySelector("[class*='modal']") || document.querySelector("[class*='tooltip']");
          return sel ? (sel.innerText || sel.textContent || "").trim() : "";
        });
      }
      if (cardText) {
        const parsed = parseSkillCardText(cardText);
        if (parsed.name && !seenNames.has(parsed.name)) {
          seenNames.add(parsed.name);
          skills.push(parsed);
        }
      }
    } catch (_) {}
  }
  return skills;
}

async function selectCharacter(page, characterName) {
  const clicked = await page.evaluate((name) => {
    const n = name.toLowerCase();
    const all = document.querySelectorAll("button, a, [role='tab'], [role='button'], [class*='tab'], [class*='character']");
    for (const el of all) {
      const t = (el.textContent || "").trim().toLowerCase();
      if (t === n || (t.length < 20 && t.includes(n))) {
        el.click();
        return true;
      }
    }
    return false;
  }, characterName);
  if (clicked) await new Promise((r) => setTimeout(r, 1200));
  return clicked;
}

async function main() {
  console.log("Launching browser...");
  const b = await getBrowser();
  const page = await b.newPage();

  const capturedJson = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (!url || !/\.json|api|graphql|data|skills|planner/i.test(url)) return;
    try {
      const text = await response.text();
      if (text.length > 200 && text.length < 800000) {
        try {
          const data = JSON.parse(text);
          if (data && (data.skills || data.tree || data.nodes || Array.isArray(data))) capturedJson.push({ url, data });
        } catch (_) {}
      }
    } catch (_) {}
  });

  await page.setViewport({ width: 1400, height: 900 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  console.log("Loading Mobalytics planner...");
  await page.goto(PLANNER_URL, { waitUntil: "networkidle2", timeout: 35000 });
  await new Promise((r) => setTimeout(r, 6000));

  const htmlPath = path.join(OUT_DIR, "_mobalytics_planner_snapshot.html");
  fs.writeFileSync(htmlPath, await page.content(), "utf8");
  console.log("Saved snapshot to", htmlPath);

  const allData = {};
  for (const char of CHARACTERS) {
    console.log("\n---", char, "---");
    const selected = await selectCharacter(page, char);
    if (!selected) console.log("  Could not select character.");
    await new Promise((r) => setTimeout(r, 1500));
    const skills = await extractSkillsForCurrentCharacter(page);
    allData[char] = skills;
    console.log("  Collected", skills.length, "skills.");
  }

  await b.close();
  browser = null;

  const existingFiles = { Amon: "Amon_en.json", Harlowe: "Harlowe_en.json", Rafa: "Rafa_en.json", Vex: "Vex_en.json" };
  for (const char of CHARACTERS) {
    const scraped = allData[char] || [];
    let existing = [];
    const fullPath = path.join(OUT_DIR, `${char}_skills_full.json`);
    if (fs.existsSync(fullPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      } catch (_) {}
    }
    if (existing.length === 0) {
      const enPath = path.join(OUT_DIR, existingFiles[char]);
      if (fs.existsSync(enPath)) existing = JSON.parse(fs.readFileSync(enPath, "utf8"));
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
    fs.writeFileSync(fullPath, JSON.stringify(merged, null, 2), "utf8");
    console.log("Wrote", fullPath, "(" + merged.length + " skills).");
  }

  if (capturedJson.length > 0) {
    fs.writeFileSync(path.join(OUT_DIR, "_mobalytics_captured_json.json"), JSON.stringify(capturedJson, null, 2), "utf8");
    console.log("\nSaved", capturedJson.length, "captured API responses.");
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  if (browser) browser.close();
  process.exit(1);
});
