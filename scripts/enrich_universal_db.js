#!/usr/bin/env node
/**
 * Enrich universal_parts_db.json from NCS parsed ui_stat4.json.
 * Fills in legendary/pearl perk descriptions, red text, and any missing effects.
 *
 * Run from repo root: node scripts/enrich_universal_db.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const NCS_BASE = "C:\\Users\\picas\\Desktop\\BL4_NCS_Tool\\ncs_automation\\NCS-data\\2026-03-29\\parsed_v3";
const UI_STAT_PATH = path.join(NCS_BASE, "pakchunk4-Windows_12_P-Nexus-Data-ui_stat4.json");
const DB_PATH = path.join(ROOT, "master_search", "db", "universal_parts_db.json");

// ── Load DB ──────────────────────────────────────────────────────────────────

const dbData = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
const rows = dbData.rows;
const byCode = new Map();
rows.forEach(r => { if (r.code) byCode.set(r.code, r); });

console.log(`Loaded ${rows.length} DB entries`);

// ── Clean NCS markup ─────────────────────────────────────────────────────────

function cleanDesc(raw) {
  if (!raw) return "";
  // NCS format: "TableName, GUID, ActualText" — extract text after 2nd comma
  // GUID is 32 hex chars
  let text = raw.replace(/^[\w_]+,\s*[0-9A-Fa-f]{20,40},\s*/, "");
  return text
    .replace(/\[\/?(rarity_legendary|rarity_pearlescent|secondary|flavor|newline|rd_color|primary|nowrap|fire_icon|fire|ice_icon|ice|shock_icon|shock|corrosive_icon|corrosive|radiation_icon|radiation|dark_icon|dark|light_icon|light)\]/gi, "")
    .replace(/\{mod\}/g, "X%")
    .replace(/\{duration\}/g, "Xs")
    .replace(/\{0\}\s*\{1\}/g, "X%")
    .replace(/\$VALUE\$/g, "X%")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Parse ui_stat4.json ──────────────────────────────────────────────────────

console.log("\nParsing ui_stat4.json...");

const uiStatText = fs.readFileSync(UI_STAT_PATH, "utf8");

// Extract ALL uistat_XXX entries with their formattext values
// Use a simple line-by-line approach for reliability
const uiStatRaw = {};
const keyRegex = /"(uistat_[a-z0-9_]+)"/gi;
let match;
while ((match = keyRegex.exec(uiStatText)) !== null) {
  const key = match[1].toLowerCase();
  // Find the next "formattext" after this key
  const after = uiStatText.substring(match.index, Math.min(match.index + 2000, uiStatText.length));
  const fmtMatch = after.match(/"formattext"[\s\S]*?"value":\s*"([^"]+)"/);
  if (fmtMatch) {
    const val = cleanDesc(fmtMatch[1]);
    if (val.length > 3 && !uiStatRaw[key]) {
      uiStatRaw[key] = val;
    }
  }
}

console.log(`  Found ${Object.keys(uiStatRaw).length} ui_stat entries`);

// Build name -> { desc, redText } lookup
const perkLookup = {}; // cleanedName -> { desc, redText }

for (const [key, val] of Object.entries(uiStatRaw)) {
  // Patterns:
  // uistat_ITEMNAME_desc -> description
  // uistat_ITEMNAME_red_text / _redtext -> red text
  // uistat_cm_CHAR_legendary_NAME -> class mod legendary desc
  // uistat_cm_CHAR_legendary_NAME_redtext -> class mod red text
  // uistat_enh_core_PERKNAME -> enhancement perk desc (no _desc suffix!)

  const descMatch = key.match(/^uistat_(.+?)_desc$/);
  if (descMatch) {
    const name = descMatch[1];
    if (!perkLookup[name]) perkLookup[name] = {};
    perkLookup[name].desc = val;
    continue;
  }
  const redMatch = key.match(/^uistat_(.+?)_red_?text$/);
  if (redMatch) {
    const name = redMatch[1];
    if (!perkLookup[name]) perkLookup[name] = {};
    perkLookup[name].redText = val;
    continue;
  }
  // Enhancement core perks: uistat_enh_core_PERKNAME (no suffix)
  const enhMatch = key.match(/^uistat_enh_core_(\w+)$/);
  if (enhMatch) {
    const name = enhMatch[1];
    if (!perkLookup["enh_" + name]) perkLookup["enh_" + name] = {};
    perkLookup["enh_" + name].desc = val;
    // Also store under plain name for broad matching
    if (!perkLookup[name]) perkLookup[name] = {};
    if (!perkLookup[name].desc) perkLookup[name].desc = val;
    continue;
  }
}

console.log(`  Built perk lookup for ${Object.keys(perkLookup).length} items`);

// Debug: show some sample entries
const sampleKeys = Object.keys(perkLookup).slice(0, 10);
sampleKeys.forEach(k => {
  const v = perkLookup[k];
  console.log(`    ${k}: desc=${(v.desc||"").slice(0,60)}... red=${(v.redText||"").slice(0,40)}`);
});

// ── Also extract class mod legendary descs with different key pattern ────────

// uistat_cm_pal_legendary_NAME (no _desc suffix — the key IS the desc)
const cmLegRegex = /uistat_cm_(pal|exo|ds|grav|robo)_legendary_(\w+)/g;
const cmDescKeys = new Set();
for (const key of Object.keys(uiStatRaw)) {
  const cm = key.match(/^uistat_cm_(pal|exo|ds|grav|robo)_legendary_(\w+?)(?:_redtext)?$/);
  if (cm) {
    const char = cm[1];
    const name = cm[2];
    const fullKey = `cm_${char}_legendary_${name}`;
    if (!perkLookup[fullKey]) perkLookup[fullKey] = {};
    if (key.includes("redtext")) {
      perkLookup[fullKey].redText = uiStatRaw[key];
    } else {
      perkLookup[fullKey].desc = uiStatRaw[key];
    }
    cmDescKeys.add(fullKey);
  }
}
console.log(`  Found ${cmDescKeys.size} class mod legendary descriptions`);

// ── Helper: try to match a DB entry to a perk lookup key ─────────────────────

function findPerkInfo(entry) {
  const partName = (entry.partName || "").toLowerCase();
  const itemType = (entry.itemType || "").toLowerCase();
  const effect = (entry.effect || "").toLowerCase();

  // Build list of candidate names to try
  const candidates = new Set();

  // From spawn code: jak_sg.part_barrel_01_hellwalker -> hellwalker
  const barrelMatch = partName.match(/part_barrel_\d+_(\w+)/);
  if (barrelMatch) candidates.add(barrelMatch[1]);

  // From comp key: comp_05_legendary_hellwalker -> hellwalker
  const compMatch = partName.match(/comp_05_(?:legendary_)?(\w+)/);
  if (compMatch) candidates.add(compMatch[1]);

  // From itemType: "Legendary: Hellwalker" or "Hellwalker - Fire Shotgun"
  const legMatch = itemType.match(/legendary:\s*(\w+)/i);
  if (legMatch) candidates.add(legMatch[1]);
  const dashMatch = itemType.match(/^([\w ]+?)\s*[-–—]/);
  if (dashMatch) candidates.add(dashMatch[1].replace(/\s+/g, ""));

  // Direct name (first word or full name)
  const words = itemType.split(/\s+/);
  if (words[0] && words[0].length > 2) candidates.add(words[0].replace(/[^a-z0-9]/gi, ""));
  candidates.add(itemType.replace(/[^a-z0-9]/gi, ""));
  candidates.add(partName.replace(/.*\./g, "").replace(/[^a-z0-9]/gi, ""));

  // From current effect: "PerkName - effect text"
  const effectMatch = (entry.effect || "").match(/^([\w ]+?)\s*[-–—]/);
  if (effectMatch) candidates.add(effectMatch[1].replace(/\s+/g, "").toLowerCase());

  // Also try Perk: prefixed from effect
  const perkMatch = (entry.effect || "").match(/Perk:\s*(\w[\w ]+)/);
  if (perkMatch) candidates.add(perkMatch[1].replace(/\s+/g, "").toLowerCase());

  // Try all candidates
  for (const raw of candidates) {
    const name = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (name.length < 3) continue;
    if (perkLookup[name]) return perkLookup[name];
  }
  return null;
}

// ── Enrich ALL categories ────────────────────────────────────────────────────

console.log("\n── Enriching all entries ──");

const stats = {};

for (const [code, entry] of byCode) {
  const cat = entry.category || "unknown";
  if (!stats[cat]) stats[cat] = { checked: 0, enriched: 0 };
  stats[cat].checked++;

  // Skip entries that already have good descriptions (>40 chars)
  if (entry.effect && entry.effect.length > 40) continue;
  // Skip rarity/model/element entries that don't need perk text
  if (entry.partType === "Rarity" || entry.partType === "Model") continue;

  const perk = findPerkInfo(entry);
  if (perk) {
    let newEffect = perk.desc || "";
    if (perk.redText) newEffect += (newEffect ? "\n" : "") + '"' + perk.redText + '"';
    if (newEffect && newEffect.length > (entry.effect || "").length) {
      entry.effect = newEffect;
      stats[cat].enriched++;
    }
  }
}

// ── Enrich class mods specifically ───────────────────────────────────────────

console.log("\n── Enriching class mod legendaries ──");

const CHAR_MAP = {
  "Amon": "pal", "Rafa": "exo", "Vex": "ds", "Harlowe": "grav", "C4SH": "robo"
};

let cmEnriched = 0;
for (const [code, entry] of byCode) {
  if (entry.category !== "Class Mod") continue;
  if (entry.effect && entry.effect.length > 40) continue;

  const mfg = (entry.manufacturer || "").trim();
  const charCode = CHAR_MAP[mfg];
  if (!charCode) continue;

  // For legendary names: build lookup key
  if (entry.partType === "Name" && entry.rarity === "Legendary") {
    const nameClean = (entry.itemType || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const lookupKey = `cm_${charCode}_legendary_${nameClean}`;

    if (perkLookup[lookupKey]) {
      const perk = perkLookup[lookupKey];
      let newEffect = perk.desc || "";
      if (perk.redText) newEffect += (newEffect ? "\n" : "") + '"' + perk.redText + '"';
      if (newEffect && newEffect.length > (entry.effect || "").length) {
        entry.effect = newEffect;
        cmEnriched++;
      }
    }
  }

  // For class mod perks (type 234): try direct name match
  if (entry.partType === "Perk") {
    const nameClean = (entry.itemType || entry.partName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    // Try: uistat_cm_perk_NAME or just NAME in perkLookup
    for (const tryKey of [`cm_perk_${nameClean}`, nameClean]) {
      if (perkLookup[tryKey]) {
        const perk = perkLookup[tryKey];
        let newEffect = perk.desc || "";
        if (newEffect && newEffect.length > (entry.effect || "").length) {
          entry.effect = newEffect;
          cmEnriched++;
          break;
        }
      }
    }
  }
}
console.log(`  Enriched ${cmEnriched} class mod entries`);

// ── Firmware descriptions (not in NCS — hardcoded from in-game) ──────────────

console.log("\n── Adding firmware descriptions ──");

const FIRMWARE_DESCS = {
  "God Killer":       "Increases damage against Badass and Boss enemies.",
  "Reel Big Fist":    "Increases melee damage.",
  "Lifeblood":        "Slowly regenerates health over time.",
  "Airstrike":        "Periodically calls down an airstrike on nearby enemies.",
  "High Caliber":     "Increases weapon damage.",
  "Gadget Ahoy":      "Increases grenade damage.",
  "Baker":            "Increases splash damage radius.",
  "Oscar Mike":       "Increases movement speed.",
  "Rubberband Man":   "Increases reload speed.",
  "Dead Eye":         "Increases critical hit damage.",
  "Action Fist":      "Increases melee damage.",
  "Atlas E.X.":       "Periodically fires a homing missile at nearby enemies.",
  "Atlas Infinum":    "Increased magazine size. Shots have a chance to not consume ammo.",
  "Daed-dy O'":       "Increased fire rate.",
  "Bullets To Spare": "Periodically regenerates ammo in the magazine.",
  "Get Throwin'":     "Increases grenade throw speed and grenade count.",
  "Goojfc":           "Increases status effect damage and chance.",
  "Heating Up":       "Increased fire rate that stacks as you continuously fire.",
  "Jacked":           "Increases gun damage and fire rate.",
  "Risky Boots":      "Increased damage at low health.",
  "Trickshot":        "Bullets have a chance to ricochet to nearby enemies.",
  "Skillcraft":       "Increases Action Skill damage.",
  "Deadeye":          "Increases critical hit damage.",
};

let fwEnriched = 0;
for (const [code, entry] of byCode) {
  if (entry.partType !== "Firmware" && entry.partType !== "Stat Perk") continue;
  if (entry.effect && entry.effect.length > 10) continue;

  const name = (entry.partName || entry.itemType || "").trim();
  // Try exact, case-insensitive, then fuzzy (strip punctuation)
  const nameLower = name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const match = FIRMWARE_DESCS[name]
    || Object.entries(FIRMWARE_DESCS).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1]
    || Object.entries(FIRMWARE_DESCS).find(([k]) => k.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim() === nameLower)?.[1]
    || Object.entries(FIRMWARE_DESCS).find(([k]) => nameLower.startsWith(k.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().slice(0, -1)))?.[1];
  if (match) {
    entry.effect = match;
    fwEnriched++;
  }
}
console.log(`  Enriched ${fwEnriched} firmware entries`);

// ── Element descriptions ─────────────────────────────────────────────────────

console.log("\n── Adding element descriptions ──");

const ELEMENT_DESCS = {
  "fire": "Deals bonus fire damage. Effective against flesh.",
  "shock": "Deals bonus shock damage. Effective against shields.",
  "corrosive": "Deals bonus corrosive damage. Effective against armor.",
  "cryo": "Deals bonus cryo damage. Slows and freezes enemies.",
  "radiation": "Deals bonus radiation damage. Irradiated enemies explode on death.",
  "dark": "Deals bonus dark damage.",
  "kinetic": "Deals kinetic (non-elemental) damage.",
  "explosive": "Deals explosive splash damage.",
  "ice": "Deals bonus cryo damage. Slows and freezes enemies.",
};

let elemEnriched = 0;
for (const [code, entry] of byCode) {
  // Match elements in ANY category (grenade elements, heavy elements, etc.)
  if (entry.partType !== "Element" && entry.category !== "Element") continue;
  if (entry.effect && entry.effect.length > 10) continue;
  const name = (entry.partName || entry.itemType || "").toLowerCase();
  for (const [elem, desc] of Object.entries(ELEMENT_DESCS)) {
    if (name.includes(elem)) {
      entry.effect = desc;
      elemEnriched++;
      break;
    }
  }
}
console.log(`  Enriched ${elemEnriched} element entries`);

// ── Write enriched DB ────────────────────────────────────────────────────────

console.log("\n── Writing enriched database ──");

dbData.generated_at_utc = new Date().toISOString();
dbData.source = "build_parts_db.js + enrich_universal_db.js (NCS ui_stat4 Cowbell DLC)";
dbData.rows = rows;

fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2), "utf8");
console.log(`Wrote ${rows.length} entries to universal_parts_db.json`);

const partsPath = path.join(ROOT, "api", "data", "parts.json");
fs.writeFileSync(partsPath, JSON.stringify(rows, null, 2), "utf8");
console.log(`Wrote ${rows.length} entries to api/data/parts.json`);

// ── Final report ─────────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════════════════════");
console.log("ENRICHMENT COMPLETE — BEFORE vs AFTER");
console.log("══════════════════════════════════════════════════════════");

const BEFORE = {
  "Class Mod": 85, "Weapon": 2256, "Enhancement": 264, "Shield": 106,
  "Grenade": 98, "Repkit": 96, "Element": 0, "Heavy": 18,
};

const finalCats = {};
rows.forEach(r => {
  const c = r.category || "unknown";
  if (!finalCats[c]) finalCats[c] = { total: 0, withEffect: 0 };
  finalCats[c].total++;
  if (r.effect && r.effect.length > 5) finalCats[c].withEffect++;
});

Object.entries(finalCats).sort((a, b) => b[1].total - a[1].total).forEach(([c, v]) => {
  const before = BEFORE[c] || 0;
  const delta = v.withEffect - before;
  const pct = Math.round(100 * v.withEffect / v.total);
  console.log(`  ${c.padEnd(14)} ${String(v.withEffect).padStart(5)}/${v.total} (${pct}%)  ${delta > 0 ? "+" + delta + " new" : "no change"}`);
});
