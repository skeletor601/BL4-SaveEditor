#!/usr/bin/env node
/**
 * Try to scrape skill data (including numeric stats) from Eridiyum BL4 planner.
 * https://eridiyum.com/ (site may be shutting down; run while still up).
 * Tries: (1) fetch HTML + embedded JSON, (2) Puppeteer + intercept API/tooltips.
 * Merges into class_mods/*_skills_full.json (adds/updates description and stats).
 *
 * Run: cd scripts && node scrape_eridiyum_skills.js
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "class_mods");
const BASE_URL = "https://eridiyum.com";
const PLANNER_URL = "https://eridiyum.com/planner";

const CHARACTERS = ["Amon", "Harlowe", "Rafa", "Vex"];
const FETCH_TIMEOUT_MS = 25000;

let browser;

function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), options.timeout || FETCH_TIMEOUT_MS);
  return fetch(url, {
    ...options,
    signal: ctrl.signal,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ...options.headers,
    },
  }).finally(() => clearTimeout(to));
}

/**
 * Extract JSON from script tags (Next.js __NEXT_DATA__, Nuxt, etc.)
 */
function extractEmbeddedJson(html) {
  const out = [];
  const scriptMatch = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i;
  const m = html.match(scriptMatch);
  if (m && m[1]) {
    try {
      out.push(JSON.parse(m[1]));
    } catch (_) {}
  }
  const anyJson = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = anyJson.exec(html)) !== null) {
    const raw = match[1].trim();
    if (raw.startsWith("window.__") || raw.startsWith("self.__") || raw.includes('"skills"') || raw.includes("skillTree")) {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          out.push(JSON.parse(jsonMatch[0]));
        } catch (_) {}
      }
    }
  }
  return out;
}

/**
 * Recursively find skill-like objects in parsed JSON.
 */
function findSkillsInObject(obj, into, depth = 0) {
  if (depth > 15) return;
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item) => findSkillsInObject(item, into, depth + 1));
    return;
  }
  const name = obj.name || obj.title || obj.skillName;
  const desc = obj.description || obj.desc || obj.effect || obj.tooltip;
  if (name && typeof name === "string" && name.length > 1 && name.length < 120) {
    const stats = obj.stats || obj.values || obj.numbers || obj.levels;
    const type = obj.type || obj.tier || obj.kind || "";
    into.push({
      name: String(name).trim(),
      type: typeof type === "string" ? type : "",
      description: typeof desc === "string" ? desc.trim() : "",
      stats: Array.isArray(stats)
        ? stats.map((s) => (typeof s === "string" ? s : typeof s === "object" && s ? `${s.label || s.name || ""}: ${s.value ?? ""}`.trim() : String(s)))
        : [],
    });
  }
  Object.keys(obj).forEach((k) => findSkillsInObject(obj[k], into, depth + 1));
}

/**
 * Try to get skill data from fetched HTML (embedded JSON).
 */
async function tryFetchHtml() {
  console.log("Trying fetch (HTML) with timeout", FETCH_TIMEOUT_MS, "ms...");
  try {
    const res = await fetchWithTimeout(PLANNER_URL, { timeout: FETCH_TIMEOUT_MS });
    if (!res.ok) return { skills: [], raw: null };
    const html = await res.text();
    const jsons = extractEmbeddedJson(html);
    const skills = [];
    jsons.forEach((j) => findSkillsInObject(j, skills));
    return { skills, raw: html.slice(0, 50000) };
  } catch (e) {
    console.warn("Fetch failed:", e.message);
    return { skills: [], raw: null };
  }
}

/**
 * Puppeteer: load planner, intercept network, try to collect skill data from tooltips or API.
 */
async function tryPuppeteer() {
  let puppeteer;
  try {
    puppeteer = require("puppeteer");
  } catch (e) {
    console.warn("Puppeteer not available:", e.message);
    return { byChar: {}, captured: [] };
  }

  console.log("Launching browser for Eridiyum...");
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const captured = [];

  await page.setRequestInterception(true);
  page.on("response", async (res) => {
    const url = res.url();
    if (!/json|api|skill|character|planner|build/i.test(url)) return;
    try {
      const body = await res.text();
      if (body.length > 100 && body.length < 500000) captured.push({ url, body });
    } catch (_) {}
  });

  try {
    await page.goto(PLANNER_URL, { waitUntil: "networkidle2", timeout: 30000 });
  } catch (e) {
    console.warn("Page load failed:", e.message);
    await browser.close();
    browser = null;
    return { byChar: {}, captured };
  }

  await new Promise((r) => setTimeout(r, 3000));

  // Try to extract from captured JSON responses
  const fromNetwork = [];
  for (const { body } of captured) {
    try {
      const j = JSON.parse(body);
      findSkillsInObject(j, fromNetwork);
    } catch (_) {}
  }

  // Try tooltips / skill nodes on page
  const tooltipSelectors = [
    '[role="tooltip"]',
    '[class*="tooltip"]',
    '[class*="Tooltip"]',
    '[class*="skill-card"]',
    '[class*="SkillCard"]',
    '[data-skill]',
    '[class*="skill-description"]',
  ];
  const nodeSelectors = [
    '[class*="skill"]',
    '[class*="node"]',
    '[class*="talent"]',
    'button[class*="skill"]',
    '[data-skill-id]',
  ];

  for (const sel of nodeSelectors) {
    try {
      const nodes = await page.$$(sel);
      for (let i = 0; i < Math.min(nodes.length, 80); i++) {
        await nodes[i].click();
        await new Promise((r) => setTimeout(r, 400));
        for (const tool of tooltipSelectors) {
          try {
            const el = await page.$(tool);
            if (el) {
              const text = await el.evaluate((e) => e.innerText || e.textContent || "");
              if (text.length > 10 && text.length < 2500) {
                const parsed = parseSkillCardText(text);
                if (parsed.name) fromNetwork.push(parsed);
              }
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  await browser.close();
  browser = null;

  return { byChar: groupSkillsByCharacter(fromNetwork), captured };
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

function groupSkillsByCharacter(skills) {
  return { _flat: skills.filter((s) => s && s.name) };
}

function mergeIntoFull(byChar) {
  const flat = byChar._flat || [];
  if (flat.length === 0) return;

  // Build index: skill name -> character (from existing files)
  const nameToChar = new Map();
  for (const char of CHARACTERS) {
    const fullPath = path.join(OUT_DIR, `${char}_skills_full.json`);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const arr = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      arr.forEach((s) => {
        if (s.name && !nameToChar.has(s.name)) nameToChar.set(s.name, char);
      });
    } catch (_) {}
  }

  // Group scraped skills by character (where we have a matching name)
  const toMerge = { Amon: [], Harlowe: [], Rafa: [], Vex: [] };
  for (const s of flat) {
    const char = nameToChar.get(s.name);
    if (char) toMerge[char].push(s);
    else toMerge.Amon.push(s);
  }

  for (const char of CHARACTERS) {
    const list = toMerge[char] || [];
    if (list.length === 0) continue;

    const fullPath = path.join(OUT_DIR, `${char}_skills_full.json`);
    let existing = [];
    if (fs.existsSync(fullPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      } catch (_) {}
    }

    const byName = new Map(existing.map((s) => [s.name, { ...s }]));
    let updated = 0;
    for (const s of list) {
      const cur = byName.get(s.name);
      if (cur) {
        if (s.stats && s.stats.length > 0) {
          cur.stats = s.stats;
          updated++;
        }
        if (s.description && s.description.length > 5) cur.description = s.description;
        if (s.type) cur.type = s.type;
      } else {
        byName.set(s.name, {
          name: s.name,
          type: s.type || "Passive",
          description: s.description || "",
          stats: s.stats || [],
        });
        updated++;
      }
    }
    const merged = Array.from(byName.values());
    fs.writeFileSync(fullPath, JSON.stringify(merged, null, 2), "utf8");
    console.log(`${char}: merged ${list.length} Eridiyum skills, ${updated} updated.`);
  }
}

async function main() {
  console.log("Eridiyum scraper (get data before shutdown)...\n");

  let byChar = { Amon: [], Harlowe: [], Rafa: [], Vex: [] };
  let allSkills = [];

  const { skills: fromHtml, raw } = await tryFetchHtml();
  if (fromHtml.length > 0) {
    console.log("From HTML embedded JSON:", fromHtml.length, "skill-like entries.");
    allSkills = fromHtml;
  }
  if (raw && allSkills.length === 0) {
    fs.writeFileSync(path.join(OUT_DIR, "_eridiyum_planner_snapshot.html"), raw, "utf8");
    console.log("Saved HTML snapshot to class_mods/_eridiyum_planner_snapshot.html");
  }

  if (allSkills.length === 0) {
    const { byChar: fromBrowser, captured } = await tryPuppeteer();
    if (Object.values(fromBrowser).some((a) => a.length > 0)) {
      byChar = fromBrowser;
      console.log("From Puppeteer: skills per char", CHARACTERS.map((c) => `${c}:${(byChar[c] || []).length}`).join(", "));
    }
    if (captured.length > 0) {
      const out = path.join(OUT_DIR, "_eridiyum_captured.json");
      fs.writeFileSync(out, JSON.stringify(captured.map(({ url, body }) => ({ url, body: body.slice(0, 10000) })), null, 2), "utf8");
      console.log("Saved", captured.length, "network responses to", out);
    }
  } else {
    byChar = groupSkillsByCharacter(allSkills);
    if (byChar.Amon.length === allSkills.length && byChar.Harlowe.length === 0) {
      byChar.Amon = allSkills;
    }
  }

  if (Object.values(byChar).some((a) => a.length > 0)) {
    console.log("\nMerging into class_mods/*_skills_full.json...");
    mergeIntoFull(byChar);
  } else {
    console.log("\nNo skill data extracted. Site may be down or structure changed.");
  }

  console.log("\nDone.");
}

main()
  .then(() => {
    if (browser) browser.close();
  })
  .catch((e) => {
    console.error(e);
    if (browser) browser.close();
    process.exit(1);
  });
