#!/usr/bin/env node
/**
 * Build script: Generates api/data/parts.json from all CSV/data sources.
 * Run from repo root: node scripts/build_parts_db.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// ── CSV parser ────────────────────────────────────────────────────────────────

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
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function readCsv(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) { console.warn(`[WARN] Not found: ${relPath}`); return []; }
  return parseCsv(fs.readFileSync(full, "utf8"));
}

// ── Category helpers ──────────────────────────────────────────────────────────

const CATEGORY_NORMALIZE = {
  "Grenades": "Grenade", "grenades": "Grenade",
  "Repkits": "Repkit", "repkits": "Repkit",
  "Shields": "Shield", "shields": "Shield",
  "Heavys": "Heavy", "Heavy Weapon": "Heavy", "heavy": "Heavy",
  "Class Mods": "Class Mod", "Classmods": "Class Mod", "Classmod": "Class Mod",
  "Enhancements": "Enhancement",
  "Weapons": "Weapon",
  "Elements": "Element",
};

function normalizeCategory(cat) {
  if (!cat) return "Weapon";
  return CATEGORY_NORMALIZE[cat] || cat;
}

// ── Category normalization ────────────────────────────────────────────────────

const ITEM_TYPE_TO_CATEGORY = {
  "Assault Rifle": "Weapon", "Pistol": "Weapon", "SMG": "Weapon",
  "Shotgun": "Weapon", "Sniper": "Weapon", "Sniper Rifle": "Weapon",
  "Heavy Weapon": "Heavy",
  "Element": "Element",
  "Ordnance": "Grenade", "Grenade": "Grenade",
  "Repkit": "Repkit",
  "Classmod": "Class Mod", "Class Mod": "Class Mod",
  "Armor Shield": "Shield", "Energy Shield": "Shield",
  "Shield": "Shield", "Firmware": "Shield", "Resistance": "Shield",
  "Enhancement": "Enhancement",
  "Stats": "Enhancement", "Main Body": "Enhancement",
  "Secondary Rarity": "Enhancement",
  // Manufacturer names when mfg=Enhancements
  "Atlas": "Enhancement", "CoV": "Enhancement", "Hyperion": "Enhancement",
  "Jakobs": "Enhancement", "Maliwan": "Enhancement", "Order": "Enhancement",
  "Ripper": "Enhancement", "Daedalus": "Enhancement",
  "Torgue": "Enhancement", "Vladof": "Enhancement",
  // Shield manufacturer names (when mfg=Shield or known shield mfg)
  // Perk context depends on mfg column
};

function inferCategory(itemType, mfg, partType) {
  const it = (itemType || "").trim();
  const m = (mfg || "").trim();
  // Skip entries we don't want
  if (it === "Weapon Skin" || it === "Customization" || m === "Customization" || m === "Citizen") return null;
  // Check manufacturer column first — it's the most reliable category signal
  if (m === "Shield") return "Shield";
  if (m === "Enhancements" || m === "Enhancement") return "Enhancement";
  if (m === "Grenades" || m === "Grenade") return "Grenade";
  if (m === "Repkits" || m === "Repkit") return "Repkit";
  if (m === "Heavy" || m === "Heavys" || m === "Heavy Weapon") return "Heavy";
  if (m === "Class Mods" || m === "Class Mod") return "Class Mod";
  if (ITEM_TYPE_TO_CATEGORY[it]) return ITEM_TYPE_TO_CATEGORY[it];
  // Perk type entries: check mfg to determine category
  if (it === "Perk" || it === "Firmware") {
    if (m === "Shield") return "Shield";
    if (m === "Grenades" || m === "Grenade") return "Grenade";
    if (m === "Repkit") return "Repkit";
    if (m === "Enhancements") return "Enhancement";
  }
  // Manufacturer-type codes (e.g. {264:x} for Hyperion, when Item Type is a manufacturer name)
  const mfgNames = ["Hyperion", "Jakobs", "Maliwan", "Atlas", "CoV", "Daedalus", "Order", "Ripper", "Tediore", "Torgue", "Vladof"];
  if (mfgNames.includes(it) && m === "Enhancements") return "Enhancement";
  if (mfgNames.includes(it) && m === "Shield") return "Shield";
  return "Weapon"; // default
}

// ── splitNameEffect for Enhancement perks ───────────────────────────────────

function splitNameEffect(combined) {
  if (!combined) return { name: "", effect: "" };
  // Try " - " first
  const withSpaces = combined.indexOf(" - ");
  if (withSpaces !== -1) {
    return { name: combined.substring(0, withSpaces).trim(), effect: combined.substring(withSpaces + 3).trim() };
  }
  // Try " -" (space + dash)
  const spaceDash = combined.indexOf(" -");
  if (spaceDash !== -1) {
    return { name: combined.substring(0, spaceDash).trim(), effect: combined.substring(spaceDash + 2).trim() };
  }
  // Try first "-" preceded by word char (not for compound names like "Extend-a-Friend")
  const dashMatch = combined.match(/^([A-Za-z][A-Za-z0-9 '!.]+?)-(.+)$/);
  if (dashMatch && dashMatch[1].split(" ").length <= 3) {
    return { name: dashMatch[1].trim(), effect: dashMatch[2].trim() };
  }
  return { name: combined.trim(), effect: "" };
}

// ── part collection ───────────────────────────────────────────────────────────

// Primary store: best entry per code
const byCode = new Map();   // code -> PartItem
const extraParts = [];      // entries without a code

function addPart(entry) {
  if (!entry.partName && !entry.code && !entry.itemType) return;
  // Clean empty fields
  for (const k of Object.keys(entry)) {
    if (entry[k] === undefined || entry[k] === null || entry[k] === "") delete entry[k];
  }
  const code = (entry.code || "").trim();
  if (code) {
    if (!byCode.has(code)) {
      byCode.set(code, entry);
    } else {
      // Merge: prefer entry with better data (more fields filled in)
      const existing = byCode.get(code);
      const existingScore = scoreEntry(existing);
      const newScore = scoreEntry(entry);
      if (newScore > existingScore) {
        byCode.set(code, entry);
      }
    }
  } else {
    extraParts.push(entry);
  }
}

function scoreEntry(e) {
  let s = 0;
  if (e.itemType && e.itemType.length > 2) s += 2;
  if (e.effect && e.effect.length > 5) s += 3;
  if (e.manufacturer) s += 1;
  if (e.weaponType) s += 1;
  if (e.partType) s += 1;
  if (e.rarity) s += 1;
  return s;
}

// ── PHASE 1: Category-specific CSVs (highest quality data) ─────────────────

// --- Shields ---
console.log("Processing shield data ...");

const SHIELD_MFG_NAMES = { 279: "Maliwan", 283: "Vladof", 287: "Tediore", 293: "Order", 300: "Ripper", 306: "Jakobs", 312: "Daedalus", 321: "Torgue" };

for (const r of readCsv("shield/shield_main_perk_EN.csv")) {
  const mainId = r["Shield_perk_main_ID"], partId = r["Part_ID"];
  const partType = r["Part_type"], stat = r["Stat"], desc = r["Description"];
  if (!partId || !mainId) continue;
  addPart({ code: `{${mainId}:${partId}}`, partName: `Shield.${partType}_${partId}`, itemType: stat || partType, partType, effect: desc || undefined, category: "Shield" });
}

for (const r of readCsv("shield/manufacturer_perk_EN.csv")) {
  const mfgId = r["Manufacturer ID"], partId = r["Part_ID"];
  const partType = r["Part_type"], stat = r["Stat"], desc = r["Description"];
  if (!partId || !mfgId) continue;
  const mfgName = SHIELD_MFG_NAMES[parseInt(mfgId)] || mfgId;
  if (partType === "Rarity") {
    addPart({ code: `{${mfgId}:${partId}}`, partName: `${mfgName}_Shield.rarity_${partId}`, itemType: desc ? `${stat} - ${desc}` : stat, partType: "Rarity", manufacturer: mfgName, category: "Shield" });
  } else if (partType === "Legendary Perk") {
    addPart({ code: `{${mfgId}:${partId}}`, partName: `${mfgName}_Shield.legendary_perk`, itemType: stat, partType: "Legendary Perk", effect: desc || undefined, manufacturer: mfgName, rarity: "Legendary", category: "Shield" });
  } else if (partType === "Model") {
    addPart({ code: `{${mfgId}:${partId}}`, partName: `${mfgName}_Shield.model`, itemType: `${mfgName} Shield Model`, partType: "Model", manufacturer: mfgName, category: "Shield" });
  }
}

// --- Grenades ---
console.log("Processing grenade data ...");

const GRENADE_MFG_NAMES = { 263: "Maliwan", 267: "Jakobs", 270: "Daedalus", 272: "Order", 278: "Ripper", 291: "Vladof", 298: "Torgue", 311: "Tediore" };

for (const r of readCsv("grenade/grenade_main_perk_EN.csv")) {
  const mainId = r["Grenade_perk_main_ID"], partId = r["Part_ID"];
  const partType = r["Part_type"], stat = r["Stat"];
  if (!partId || !mainId) continue;
  addPart({ code: `{${mainId}:${partId}}`, partName: `Grenade.${partType}_${partId}`, itemType: stat || partType, partType, category: "Grenade" });
}

for (const r of readCsv("grenade/manufacturer_rarity_perk_EN.csv")) {
  const mfgId = r["Manufacturer ID"], partId = r["Part_ID"];
  const partType = r["Part_type"], stat = r["Stat"], desc = r["Description"];
  if (!partId || !mfgId) continue;
  const mfgName = GRENADE_MFG_NAMES[parseInt(mfgId)] || mfgId;
  if (partType === "Rarity") {
    addPart({ code: `{${mfgId}:${partId}}`, partName: `${mfgName}_Grenade.rarity_${partId}`, itemType: desc ? `${stat} - ${desc}` : stat, partType: "Rarity", manufacturer: mfgName, category: "Grenade" });
  } else if (partType === "Legendary Perk") {
    addPart({ code: `{${mfgId}:${partId}}`, partName: `${mfgName}_Grenade.legendary_perk`, itemType: stat, partType: "Legendary Perk", effect: desc || undefined, manufacturer: mfgName, rarity: "Legendary", category: "Grenade" });
  } else if (partType === "Perk") {
    addPart({ code: `{${mfgId}:${partId}}`, partName: `${mfgName}_Grenade.perk_${partId}`, itemType: stat, partType: "Perk", effect: desc || undefined, manufacturer: mfgName, category: "Grenade" });
  }
}

// --- Repkits ---
console.log("Processing repkit data ...");

const REPKIT_MFG_NAMES = { 277: "Daedalus", 265: "Jakobs", 266: "Maliwan", 285: "Order", 274: "Ripper", 290: "Tediore", 261: "Torgue", 269: "Vladof" };

for (const r of readCsv("repkit/repkit_main_perk_EN.csv")) {
  const mainId = r["Repkit_perk_main_ID"], partId = r["Part_ID"];
  const partType = r["Part_type"], stat = r["Stat"], desc = r["Description"];
  if (!partId || !mainId) continue;
  addPart({ code: `{${mainId}:${partId}}`, partName: `Repkit.${partType}_${partId}`, itemType: stat || partType, partType, effect: desc || undefined, category: "Repkit" });
}

for (const r of readCsv("repkit/repkit_manufacturer_perk_EN.csv")) {
  const mfgId = r["Manufacturer ID"], partId = r["Part_ID"];
  const partType = r["Part_type"], stat = r["Stat"], desc = r["Description"];
  if (!partId || !mfgId) continue;
  const mfgName = REPKIT_MFG_NAMES[parseInt(mfgId)] || mfgId;
  if (partType === "Rarity") {
    addPart({ code: `{${mfgId}:${partId}}`, partName: `${mfgName}_Repkit.rarity_${partId}`, itemType: desc ? `${stat} - ${desc}` : stat, partType: "Rarity", manufacturer: mfgName, category: "Repkit" });
  } else if (partType === "Legendary Perk") {
    addPart({ code: `{${mfgId}:${partId}}`, partName: `${mfgName}_Repkit.legendary_perk`, itemType: stat, partType: "Legendary Perk", effect: desc || undefined, manufacturer: mfgName, rarity: "Legendary", category: "Repkit" });
  } else if (partType === "Model") {
    addPart({ code: `{${mfgId}:${partId}}`, partName: `${mfgName}_Repkit.model`, itemType: desc || `${mfgName} Repkit Model`, partType: "Model", manufacturer: mfgName, category: "Repkit" });
  }
}

// --- Enhancements ---
console.log("Processing enhancement data ...");

const ENH_MFG_NAMES = { 284: "Atlas", 286: "COV", 299: "Daedalus", 264: "Hyperion", 268: "Jakobs", 271: "Maliwan", 296: "Ripper", 292: "Tediore", 281: "The Order", 303: "Torgue", 310: "Vladof" };

for (const r of readCsv("enhancement/Enhancement_manufacturers.csv")) {
  const mfgId = r["manufacturers_ID"], mfgName = r["manufacturers_name"];
  const perkId = r["perk_ID"], perkNameEN = r["perk_name_EN"];
  if (!mfgId || !perkId) continue;
  const { name, effect } = splitNameEffect(perkNameEN);
  addPart({ code: `{${mfgId}:${perkId}}`, partName: `${mfgName || "Unknown"}_Enhancement.part_core_${perkId}`, itemType: name || perkNameEN, partType: "Core Perk", effect: effect || undefined, manufacturer: mfgName || ENH_MFG_NAMES[parseInt(mfgId)], rarity: "Legendary", category: "Enhancement" });
}

for (const r of readCsv("enhancement/Enhancement_rarity.csv")) {
  const mfgId = r["manufacturers_ID"], mfgName = r["manufacturers_name"];
  const rarityId = r["rarity_ID"], rarity = r["rarity"];
  if (!mfgId || !rarityId || !rarity) continue;
  const mfg = mfgName || ENH_MFG_NAMES[parseInt(mfgId)] || mfgId;
  addPart({ code: `{${mfgId}:${rarityId}}`, partName: `${mfg}_Enhancement.rarity_${rarityId}`, itemType: `${mfg} Enhancement - ${rarity}`, partType: "Rarity", manufacturer: mfg, rarity, category: "Enhancement" });
}

for (const r of readCsv("enhancement/Enhancement_perk.csv")) {
  const typeId = r["manufacturers_ID"], perkId = r["perk_ID"], perkNameEN = r["perk_name_EN"];
  if (!typeId || !perkId || !perkNameEN) continue;
  addPart({ code: `{${typeId}:${perkId}}`, partName: `Enhancement.part_stat_${perkId}`, itemType: perkNameEN, partType: "Stat Perk", category: "Enhancement" });
}

// --- Class Mods ---
console.log("Processing class mod data ...");

const CLASS_IDS_MAP = { "255": "Amon", "259": "Harlowe", "256": "Rafa", "254": "Vex", "404": "C4SH" };

for (const r of readCsv("class_mods/Class_rarity_name.csv")) {
  const classId = r["class_ID"], className = r["class_name"] || CLASS_IDS_MAP[r["class_ID"]] || r["class_ID"];
  const rarity = r["rarity"], nameCode = r["name_code"], nameEN = r["name_EN"];
  if (!classId || !nameCode || !nameEN) continue;
  addPart({ code: `{${classId}:${nameCode}}`, partName: `${className}_ClassMod.name_${nameCode}`, itemType: nameEN, partType: "Name", rarity: rarity === "legendary" ? "Legendary" : "Normal", manufacturer: className, category: "Class Mod" });
}

for (const r of readCsv("class_mods/Class_perk.csv")) {
  const perkId = r["perk_ID"], perkNameEN = r["perk_name_EN"];
  if (!perkId || !perkNameEN) continue;
  addPart({ code: `{234:${perkId}}`, partName: `ClassMod.perk_${perkId}`, itemType: perkNameEN, partType: "Perk", category: "Class Mod" });
}

for (const r of readCsv("class_mods/Skills.csv")) {
  const classId = r["class_ID"], className = CLASS_IDS_MAP[r["class_ID"]] || r["class_ID"];
  const skillNameEN = r["skill_name_EN"];
  if (!classId || !skillNameEN) continue;
  for (let i = 1; i <= 5; i++) {
    const skillId = r[`skill_ID_${i}`];
    if (!skillId) continue;
    addPart({ code: `{${classId}:${skillId}}`, partName: `${className}_ClassMod.skill_${skillId}`, itemType: skillNameEN, partType: "Skill", manufacturer: className, category: "Class Mod" });
  }
}

// --- Heavy Weapons ---
console.log("Processing heavy weapon data ...");

const HEAVY_MFG_NAMES = { 282: "Vladof", 273: "Torgue", 275: "Ripper", 289: "Maliwan" };

for (const r of readCsv("heavy/heavy_main_perk_EN.csv")) {
  const mainId = r["Heavy_perk_main_ID"], partId = r["Part_ID"];
  const partType = r["Part_type"], stat = r["Stat"], desc = r["Description"];
  if (!partId) continue;
  const typeId = mainId || "244";
  addPart({ code: `{${typeId}:${partId}}`, partName: `Heavy.${partType}_${partId}`, itemType: stat || partType, partType, effect: desc || undefined, category: "Heavy" });
}

for (const r of readCsv("heavy/heavy_manufacturer_perk_EN.csv")) {
  const mfgId = r["Manufacturer ID"], partId = r["Part_ID"];
  const partType = r["Part_type"], string = r["String"], stat = r["Stat"], desc = r["Description"];
  if (!partId || !mfgId) continue;
  const mfgName = HEAVY_MFG_NAMES[parseInt(mfgId)] || mfgId;
  const displayName = stat || string || desc || `${mfgName} Part ${partId}`;
  if (partType === "Rarity") {
    addPart({ code: `{${mfgId}:${partId}}`, partName: `${mfgName}_Heavy.rarity_${partId}`, itemType: desc ? `${displayName} - ${desc}` : displayName, partType: "Rarity", manufacturer: mfgName, category: "Heavy" });
  } else {
    addPart({ code: `{${mfgId}:${partId}}`, partName: `${mfgName}_Heavy.${partType.replace(/\s+/g, "_")}_${partId}`, itemType: displayName, partType, effect: desc || undefined, manufacturer: mfgName, category: "Heavy" });
  }
}

// ── PHASE 2: Weapon parts from all_weapon_part_EN.csv + elemental.csv ────────

console.log("Processing weapon parts data ...");

for (const r of readCsv("weapon_edit/all_weapon_part_EN.csv")) {
  const typeId = r["Manufacturer & Weapon Type ID"], partId = r["Part ID"];
  const mfg = r["Manufacturer"], weaponType = r["Weapon Type"];
  const partType = r["Part Type"], string = r["String"], stat = r["Stat"], desc = r["Description"];
  if (!typeId || !partId) continue;
  const displayName = stat || string || `${mfg} ${weaponType} ${partType} ${partId}`;
  const effect = desc || stat || "";
  const rarity = partType === "Rarity" ? (stat || "").split(" ")[0] || undefined : undefined;
  addPart({
    code: `{${typeId}:${partId}}`,
    partName: string || `${mfg}_${weaponType}.part_${partId}`,
    itemType: displayName,
    manufacturer: mfg || undefined,
    weaponType: weaponType || undefined,
    partType: partType || undefined,
    effect: effect || undefined,
    rarity: rarity || undefined,
    category: "Weapon",
  });
}

console.log("Processing elemental data ...");

for (const r of readCsv("weapon_edit/elemental.csv")) {
  const typeId = r["Elemental_ID"], partId = r["Part_ID"], stat = r["Stat"];
  if (!typeId || !partId) continue;
  addPart({
    code: `{${typeId}:${partId}}`,
    partName: `Element.part_${partId}`,
    itemType: stat || `Element ${partId}`,
    partType: "Element",
    category: "Element",
  });
}

// ── PHASE 2b: Legacy embedded_parts_export.csv (if present) ─────────────────

console.log("Processing embedded_parts_export.csv ...");

for (const r of readCsv("trash/reference htmls/embedded_parts_export.csv")) {
  const typeId = r["typeId"], partId = r["partId"], fullId = r["fullId"];
  if (!typeId || !partId) continue;
  // fullId is already "typeId:partId" (e.g. "13:2"), so wrap it directly.
  // Fallback: if fullId missing, use typeId:partId but only if partId doesn't already contain typeId.
  const codeInner = fullId || (partId.includes(":") ? partId : `${typeId}:${partId}`);
  const code = `{${codeInner}}`;
  const name = r["name"], spawnCode = r["spawn_code"], stats = r["stats"];
  const effects = r["effects"], description = r["description"];
  const partType = r["partType"], category = r["category"] || "Weapon";
  const manufacturer = r["manufacturer"], weaponType = r["weaponType"];
  const legendaryName = r["legendaryName"], perkName = r["perkName"], rarity = r["rarity"];

  if (!name && !spawnCode) continue;

  const displayName = legendaryName ? `${legendaryName}${perkName ? ` - ${perkName}` : ""}` : (name || spawnCode);
  const effect = effects || stats || description || "";

  addPart({
    code,
    partName: spawnCode || name,
    itemType: displayName,
    manufacturer: manufacturer || undefined,
    weaponType: weaponType || undefined,
    partType: partType || undefined,
    effect: effect || undefined,
    rarity: rarity || undefined,
    category: normalizeCategory(category),
  });
}

// ── PHASE 3: BL4_master_database.csv (fill remaining gaps) ─────────────────

console.log("Processing BL4_master_database.csv ...");

for (const r of readCsv("trash/reference htmls/BL4_master_database.csv")) {
  const code = r["Code"], partName = r["Name"];
  const manufacturer = r["Manufacturer"], itemTypeRaw = r["Item Type"];
  const partType = r["Part Type"], description = r["Description"];
  const info = r["Info"], elemental = r["Elemental"];

  if (!code && !partName) continue;

  const category = inferCategory(itemTypeRaw, manufacturer, partType);
  if (!category) continue; // skip unwanted (Customization, Weapon Skin etc.)

  const weaponTypes = ["Assault Rifle", "Pistol", "SMG", "Shotgun", "Sniper", "Sniper Rifle"];
  const displayName = elemental || description || partType || partName;
  const effect = info || description || "";

  addPart({
    code: code || undefined,
    partName: partName || undefined,
    itemType: displayName,
    manufacturer: weaponTypes.includes(manufacturer) ? undefined : (manufacturer || undefined),
    weaponType: weaponTypes.includes(itemTypeRaw) ? itemTypeRaw : undefined,
    partType: partType || undefined,
    effect: effect || undefined,
    category,
  });
}

// ── Build final list ──────────────────────────────────────────────────────────

const allParts = Array.from(byCode.values()).concat(extraParts);

// ── Write output ──────────────────────────────────────────────────────────────

const outPath = path.join(ROOT, "api", "data", "parts.json");
fs.writeFileSync(outPath, JSON.stringify(allParts, null, 2), "utf8");
console.log(`Wrote ${allParts.length} entries to api/data/parts.json`);

// Also write universal_parts_db.json (used as first-priority by api/src/data/parts.ts)
const universalDbPath = path.join(ROOT, "master_search", "db", "universal_parts_db.json");
const universalDb = {
  generated_at_utc: new Date().toISOString(),
  source: "build_parts_db.js",
  rows: allParts,
};
fs.writeFileSync(universalDbPath, JSON.stringify(universalDb, null, 2), "utf8");
console.log(`Wrote ${allParts.length} entries to master_search/db/universal_parts_db.json`);

console.log(`\nDone! Total: ${allParts.length} entries`);

const byCat = {};
for (const p of allParts) {
  const cat = p.category || "Unknown";
  byCat[cat] = (byCat[cat] || 0) + 1;
}
console.log("\nSummary by category:");
for (const [cat, count] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`);
}
