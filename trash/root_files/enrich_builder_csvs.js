#!/usr/bin/env node
/**
 * Enrich builder CSVs with Stats/Effects/Descriptions from master list files.
 * Run: node scripts/enrich_builder_csvs.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// ── CSV helpers ───────────────────────────────────────────────────────────────

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

function parseCsv(content) {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = splitCsvLine(line);
    const row = {};
    headers.forEach((h, j) => { row[h] = (vals[j] || "").trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

function parseTsv(content) {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const headers = lines[0].split("\t").map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = line.split("\t");
    const row = {};
    headers.forEach((h, j) => { row[h] = (vals[j] || "").trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

function escapeCsvField(val) {
  if (!val) return "";
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map(h => escapeCsvField(row[h] || "")).join(","));
  }
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  console.log(`  Wrote ${rows.length} rows → ${path.relative(ROOT, filePath)}`);
}

// ── Build master lookup: "typeId:partId" → { stats, effects, comments, name } ─

function buildLookup(masterRows, typeIdCol, idCol, statsCol, effectsCol, commentsCol, nameCol) {
  const map = new Map();
  for (const r of masterRows) {
    const tid = (r[typeIdCol] || "").trim();
    const id  = (r[idCol]     || "").trim();
    if (!tid || !id) continue;
    const key = `${tid}:${id}`;
    map.set(key, {
      stats:    (r[statsCol]    || "").trim(),
      effects:  effectsCol  ? (r[effectsCol]  || "").trim() : "",
      comments: commentsCol ? (r[commentsCol] || "").trim() : "",
      name:     nameCol     ? (r[nameCol]     || "").trim() : "",
    });
  }
  return map;
}

function bestDescription(entry) {
  // Build the richest possible description from available fields
  const parts = [];
  if (entry.stats   && entry.stats   !== "No Stat Changes") parts.push(entry.stats);
  if (entry.effects && entry.effects !== entry.stats)       parts.push(entry.effects);
  if (entry.comments)                                        parts.push(entry.comments);
  return parts.join(" — ");
}

// ── SHIELD ────────────────────────────────────────────────────────────────────

console.log("\n=== Enriching SHIELD CSVs ===");
{
  const masterPath = path.join(ROOT, "master_search/db/Borderlands 4 Item Parts Master List - Shields.csv");
  const { rows: masterRows } = parseCsv(fs.readFileSync(masterPath, "utf8"));
  const lookup = buildLookup(masterRows, "Type ID", "ID", "Stats", "Effects", "Comments", "Name");

  // shield_main_perk_EN.csv  — join on Shield_perk_main_ID : Part_ID
  const mainPath = path.join(ROOT, "shield/shield_main_perk_EN.csv");
  const { headers: mainH, rows: mainRows } = parseCsv(fs.readFileSync(mainPath, "utf8"));
  let enriched = 0;
  for (const r of mainRows) {
    const key = `${r["Shield_perk_main_ID"]}:${r["Part_ID"]}`;
    const m = lookup.get(key);
    if (m) {
      const desc = bestDescription(m);
      if (desc && !r["Description"]) { r["Description"] = desc; enriched++; }
      // Also fill Stat name if missing
      if (m.name && !r["Stat"]) r["Stat"] = m.name;
    }
  }
  console.log(`  shield_main_perk_EN: ${enriched} descriptions added`);
  writeCsv(mainPath, mainH.includes("Description") ? mainH : [...mainH, "Description"], mainRows);

  // manufacturer_perk_EN.csv — join on Manufacturer ID : Part_ID
  const mfgPath = path.join(ROOT, "shield/manufacturer_perk_EN.csv");
  const { headers: mfgH, rows: mfgRows } = parseCsv(fs.readFileSync(mfgPath, "utf8"));
  enriched = 0;
  for (const r of mfgRows) {
    const key = `${r["Manufacturer ID"]}:${r["Part_ID"]}`;
    const m = lookup.get(key);
    if (m) {
      const desc = bestDescription(m);
      if (desc && !r["Description"]) { r["Description"] = desc; enriched++; }
      if (m.name && !r["Stat"]) r["Stat"] = m.name;
    }
  }
  console.log(`  manufacturer_perk_EN: ${enriched} descriptions added`);
  writeCsv(mfgPath, mfgH.includes("Description") ? mfgH : [...mfgH, "Description"], mfgRows);
}

// ── GRENADE ───────────────────────────────────────────────────────────────────

console.log("\n=== Enriching GRENADE CSVs ===");
{
  const masterPath = path.join(ROOT, "master_search/db/Borderlands 4 Item Parts Master List - Grenades.csv");
  const { rows: masterRows } = parseCsv(fs.readFileSync(masterPath, "utf8"));
  const lookup = buildLookup(masterRows, "Type ID", "ID", "Stats", "Effects", "Comments", "Name");

  // grenade_main_perk_EN.csv — join on Grenade_perk_main_ID : Part_ID
  const mainPath = path.join(ROOT, "grenade/grenade_main_perk_EN.csv");
  const { headers: mainH, rows: mainRows } = parseCsv(fs.readFileSync(mainPath, "utf8"));
  // Ensure Description column exists
  const mainHeaders = mainH.includes("Description") ? mainH : [...mainH, "Description"];
  let enriched = 0;
  for (const r of mainRows) {
    const key = `${r["Grenade_perk_main_ID"]}:${r["Part_ID"]}`;
    const m = lookup.get(key);
    if (m) {
      const desc = bestDescription(m);
      if (desc && !r["Description"]) { r["Description"] = desc; enriched++; }
      if (m.name && !r["Stat"]) r["Stat"] = m.name;
    }
  }
  console.log(`  grenade_main_perk_EN: ${enriched} descriptions added`);
  writeCsv(mainPath, mainHeaders, mainRows);

  // manufacturer_rarity_perk_EN.csv — join on Manufacturer ID : Part_ID
  const mfgPath = path.join(ROOT, "grenade/manufacturer_rarity_perk_EN.csv");
  const { headers: mfgH, rows: mfgRows } = parseCsv(fs.readFileSync(mfgPath, "utf8"));
  const mfgHeaders = mfgH.includes("Description") ? mfgH : [...mfgH, "Description"];
  enriched = 0;
  for (const r of mfgRows) {
    const key = `${r["Manufacturer ID"]}:${r["Part_ID"]}`;
    const m = lookup.get(key);
    if (m) {
      const desc = bestDescription(m);
      if (desc && !r["Description"]) { r["Description"] = desc; enriched++; }
      if (m.name && !r["Stat"]) r["Stat"] = m.name;
    }
  }
  console.log(`  manufacturer_rarity_perk_EN: ${enriched} descriptions added`);
  writeCsv(mfgPath, mfgHeaders, mfgRows);
}

// ── REPKIT ────────────────────────────────────────────────────────────────────

console.log("\n=== Enriching REPKIT CSVs ===");
{
  const masterPath = path.join(ROOT, "master_search/db/Borderlands 4 Item Parts Master List - Repkits.csv");
  const { rows: masterRows } = parseCsv(fs.readFileSync(masterPath, "utf8"));
  const lookup = buildLookup(masterRows, "Type ID", "ID", "Stats", "Effects", "Comments", "Name");

  const mainPath = path.join(ROOT, "repkit/repkit_main_perk_EN.csv");
  const { headers: mainH, rows: mainRows } = parseCsv(fs.readFileSync(mainPath, "utf8"));
  let enriched = 0;
  for (const r of mainRows) {
    const key = `${r["Repkit_perk_main_ID"]}:${r["Part_ID"]}`;
    const m = lookup.get(key);
    if (m) {
      const desc = bestDescription(m);
      if (desc && !r["Description"]) { r["Description"] = desc; enriched++; }
      if (m.name && !r["Stat"]) r["Stat"] = m.name;
    }
  }
  console.log(`  repkit_main_perk_EN: ${enriched} descriptions added`);
  writeCsv(mainPath, mainH, mainRows);

  const mfgPath = path.join(ROOT, "repkit/repkit_manufacturer_perk_EN.csv");
  const { headers: mfgH, rows: mfgRows } = parseCsv(fs.readFileSync(mfgPath, "utf8"));
  enriched = 0;
  for (const r of mfgRows) {
    const key = `${r["Manufacturer ID"]}:${r["Part_ID"]}`;
    const m = lookup.get(key);
    if (m) {
      const desc = bestDescription(m);
      if (desc && !r["Description"]) { r["Description"] = desc; enriched++; }
      if (m.name && !r["Stat"]) r["Stat"] = m.name;
    }
  }
  console.log(`  repkit_manufacturer_perk_EN: ${enriched} descriptions added`);
  writeCsv(mfgPath, mfgH, mfgRows);
}

// ── HEAVY ─────────────────────────────────────────────────────────────────────

console.log("\n=== Enriching HEAVY CSVs ===");
{
  const masterPath = path.join(ROOT, "master_search/db/Borderlands 4 Item Parts Master List - Heavy Weapons.tsv");
  const { rows: masterRows } = parseTsv(fs.readFileSync(masterPath, "utf8"));
  const lookup = buildLookup(masterRows, "Type ID", "ID", "Stats", "Effects", "Comments", "Part Type");

  const mainPath = path.join(ROOT, "heavy/heavy_main_perk_EN.csv");
  const { headers: mainH, rows: mainRows } = parseCsv(fs.readFileSync(mainPath, "utf8"));
  let enriched = 0;
  for (const r of mainRows) {
    const key = `${r["Heavy_perk_main_ID"]}:${r["Part_ID"]}`;
    const m = lookup.get(key);
    if (m) {
      const desc = bestDescription(m);
      if (desc && !r["Description"]) { r["Description"] = desc; enriched++; }
    }
  }
  console.log(`  heavy_main_perk_EN: ${enriched} descriptions added`);
  writeCsv(mainPath, mainH, mainRows);

  const mfgPath = path.join(ROOT, "heavy/heavy_manufacturer_perk_EN.csv");
  const { headers: mfgH, rows: mfgRows } = parseCsv(fs.readFileSync(mfgPath, "utf8"));
  enriched = 0;
  for (const r of mfgRows) {
    const key = `${r["Manufacturer ID"]}:${r["Part_ID"]}`;
    const m = lookup.get(key);
    if (m) {
      const desc = bestDescription(m);
      if (desc && !r["Description"]) { r["Description"] = desc; enriched++; }
      if (m.name && !r["String"]) r["String"] = m.name;
    }
  }
  console.log(`  heavy_manufacturer_perk_EN: ${enriched} descriptions added`);
  writeCsv(mfgPath, mfgH, mfgRows);
}

// ── ENHANCEMENT ───────────────────────────────────────────────────────────────

console.log("\n=== Enriching ENHANCEMENT CSVs ===");
{
  const masterPath = path.join(ROOT, "master_search/db/Borderlands 4 Item Parts Master List - Enhancements.csv");
  const { rows: masterRows } = parseCsv(fs.readFileSync(masterPath, "utf8"));
  const lookup = buildLookup(masterRows, "Type ID", "ID", "Stats", "Effects", null, "Name");

  // Enhancement_manufacturers.csv — split perk_name_EN into Name + description if not already
  // The perk_name_EN currently contains "Name -Description". Master list has clean Name + Stats separately.
  const mfgPath = path.join(ROOT, "enhancement/Enhancement_manufacturers.csv");
  const { headers: mfgH, rows: mfgRows } = parseCsv(fs.readFileSync(mfgPath, "utf8"));
  // Add perk_description_EN column if missing
  const mfgHeaders = mfgH.includes("perk_description_EN") ? mfgH : [...mfgH, "perk_description_EN"];
  let enriched = 0;
  for (const r of mfgRows) {
    const key = `${r["manufacturers_ID"]}:${r["perk_ID"]}`;
    const m = lookup.get(key);
    if (m) {
      // Set clean name from master list
      if (m.name && r["perk_name_EN"]) {
        // Replace combined "Name -Description" with just the clean name
        const combined = r["perk_name_EN"];
        const nameOnly = m.name;
        if (combined !== nameOnly) r["perk_name_EN"] = nameOnly;
      }
      // Set description from master list Stats
      if (m.stats && !r["perk_description_EN"]) {
        r["perk_description_EN"] = m.stats;
        enriched++;
      }
    }
  }
  console.log(`  Enhancement_manufacturers: ${enriched} descriptions added, perk names cleaned`);
  writeCsv(mfgPath, mfgHeaders, mfgRows);

  // Enhancement_perk.csv (247 builder stats)
  const perkPath = path.join(ROOT, "enhancement/Enhancement_perk.csv");
  const { headers: perkH, rows: perkRows } = parseCsv(fs.readFileSync(perkPath, "utf8"));
  const perkHeaders = perkH.includes("perk_description_EN") ? perkH : [...perkH, "perk_description_EN"];
  enriched = 0;
  for (const r of perkRows) {
    const key = `247:${r["perk_ID"]}`;
    const m = lookup.get(key);
    if (m) {
      const desc = m.stats || m.effects;
      if (desc && !r["perk_description_EN"]) { r["perk_description_EN"] = desc; enriched++; }
    }
  }
  console.log(`  Enhancement_perk (247): ${enriched} descriptions added`);
  writeCsv(perkPath, perkHeaders, perkRows);
}

console.log("\nDone! All builder CSVs enriched.");
console.log("Run 'node scripts/build_parts_db.js' to rebuild universal search DB.");
