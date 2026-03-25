#!/usr/bin/env node
/**
 * enrich_all_databases.js
 * Enriches api/data/parts.json and master_search/db/universal_parts_db.json
 * using scripts/big_editor_parts_flat.json as the source of enrichment data.
 *
 * Rules:
 * - NEVER overwrite fields that already have real data
 * - NEVER add duplicate entries or remove existing entries
 * - Code format stays as {typeId:partId}
 * - Back up each file before modifying
 * - Log enrichment counts per file
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ─── Helpers ────────────────────────────────────────────────────────────────

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function backupFile(filePath) {
  const bakPath = filePath + '.bak';
  fs.copyFileSync(filePath, bakPath);
  return bakPath;
}

/** Strip braces from {typeId:partId} → "typeId:partId" */
function codeToId(code) {
  return code.replace(/^\{/, '').replace(/\}$/, '').trim();
}

/** Return true if a value is "empty" / generic / not real data */
function isEmpty(val) {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  if (typeof val === 'boolean') return false; // false is a real value
  return false;
}

// ─── Load source data ────────────────────────────────────────────────────────

const bigEditorPath = path.join(ROOT, 'scripts', 'big_editor_parts_flat.json');
const bigEditorRaw = readJson(bigEditorPath);
const bigParts = bigEditorRaw.parts; // array

// Build a lookup map: "typeId:partId" → bigEditorEntry
const bigMap = new Map();
for (const part of bigParts) {
  bigMap.set(part.id, part);
}
console.log(`[source] big_editor_parts_flat.json — ${bigParts.length} parts loaded`);

// Mapping from big-editor fields to our DB fields
// Format: { bigField: ourField }
const FIELD_MAP = {
  description:    'description',
  stats:          'stats',
  effects:        'effects',
  legendary_name: 'legendaryName',
  spawn_code:     'spawnCode',
  element_name:   'elementName',
  dlc_name:       'dlcName',
  perk_name:      'perkName',
};

// dlc is a boolean — only add if big says true
const BOOL_FIELDS = { dlc: 'dlc' };

/**
 * Enrich a single DB entry using the matching big-editor entry.
 * Returns the number of NEW fields added.
 */
function enrichEntry(dbEntry, bigEntry) {
  let added = 0;

  for (const [bigField, ourField] of Object.entries(FIELD_MAP)) {
    const bigVal = bigEntry[bigField];
    // Only add if big has real data AND our entry is missing it
    if (!isEmpty(bigVal) && isEmpty(dbEntry[ourField])) {
      dbEntry[ourField] = bigVal;
      added++;
    }
  }

  // Handle boolean DLC field
  if (bigEntry.dlc === true && isEmpty(dbEntry['dlc'])) {
    dbEntry['dlc'] = true;
    added++;
  }

  return added;
}

// ─── Report accumulator ─────────────────────────────────────────────────────

const report = [];
function log(msg) {
  console.log(msg);
  report.push(msg);
}

// ─── 1. Enrich api/data/parts.json ──────────────────────────────────────────

const apiPartsPath = path.join(ROOT, 'api', 'data', 'parts.json');
log('\n=== Enriching api/data/parts.json ===');

const apiPartsBefore = readJson(apiPartsPath);
const apiCountBefore = apiPartsBefore.length;
log(`  Entries before: ${apiCountBefore}`);

backupFile(apiPartsPath);
log(`  Backup: ${apiPartsPath}.bak`);

let apiEntriesEnriched = 0;
let apiFieldsAdded = 0;

for (const entry of apiPartsBefore) {
  const id = codeToId(entry.code);
  const bigEntry = bigMap.get(id);
  if (bigEntry) {
    const added = enrichEntry(entry, bigEntry);
    if (added > 0) {
      apiEntriesEnriched++;
      apiFieldsAdded += added;
    }
  }
}

writeJson(apiPartsPath, apiPartsBefore);

const apiCountAfter = readJson(apiPartsPath).length;
log(`  Entries after:  ${apiCountAfter}`);
log(`  Entries enriched: ${apiEntriesEnriched}`);
log(`  Fields added:     ${apiFieldsAdded}`);

if (apiCountBefore !== apiCountAfter) {
  log(`  *** ERROR: Entry count changed! ${apiCountBefore} → ${apiCountAfter}`);
  process.exit(1);
}

// ─── 2. Enrich master_search/db/universal_parts_db.json ─────────────────────

const universalDbPath = path.join(ROOT, 'master_search', 'db', 'universal_parts_db.json');
log('\n=== Enriching master_search/db/universal_parts_db.json ===');

const universalDbBefore = readJson(universalDbPath);
const universalRowsBefore = universalDbBefore.rows;
const universalCountBefore = universalRowsBefore.length;
log(`  Entries before: ${universalCountBefore}`);

backupFile(universalDbPath);
log(`  Backup: ${universalDbPath}.bak`);

let uniEntriesEnriched = 0;
let uniFieldsAdded = 0;

for (const entry of universalRowsBefore) {
  const id = codeToId(entry.code);
  const bigEntry = bigMap.get(id);
  if (bigEntry) {
    const added = enrichEntry(entry, bigEntry);
    if (added > 0) {
      uniEntriesEnriched++;
      uniFieldsAdded += added;
    }
  }
}

writeJson(universalDbPath, universalDbBefore);

const universalDbAfter = readJson(universalDbPath);
const universalCountAfter = universalDbAfter.rows.length;
log(`  Entries after:  ${universalCountAfter}`);
log(`  Entries enriched: ${uniEntriesEnriched}`);
log(`  Fields added:     ${uniFieldsAdded}`);

if (universalCountBefore !== universalCountAfter) {
  log(`  *** ERROR: Entry count changed! ${universalCountBefore} → ${universalCountAfter}`);
  process.exit(1);
}

// ─── 3. Scan for other JSON files with item codes (outside exclusions) ────────

log('\n=== Scanning for other JSON databases ===');

const EXCLUDE_DIRS = new Set(['trash', 'node_modules', '.git', 'web', 'api', 'scripts']);

function findJsonFiles(dir) {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (_) { return results; }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    const relPart = path.relative(ROOT, fullPath).split(path.sep)[0];

    if (EXCLUDE_DIRS.has(relPart)) continue;

    if (entry.isDirectory()) {
      results.push(...findJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(fullPath);
    }
  }
  return results;
}

const otherJsonFiles = findJsonFiles(ROOT).filter(
  f => f !== apiPartsPath && f !== universalDbPath
);

log(`  Found ${otherJsonFiles.length} other JSON files to check`);

for (const filePath of otherJsonFiles) {
  let raw;
  try { raw = readJson(filePath); } catch (_) { continue; }

  // Determine if file contains entries with a "code" field
  let rows = null;
  if (Array.isArray(raw)) {
    if (raw.length > 0 && raw[0] && typeof raw[0].code === 'string') {
      rows = raw;
    }
  } else if (raw && Array.isArray(raw.rows) && raw.rows.length > 0 && raw.rows[0] && typeof raw.rows[0].code === 'string') {
    rows = raw.rows;
  }

  if (!rows) continue;

  const relPath = path.relative(ROOT, filePath);
  log(`\n  Processing: ${relPath}`);
  log(`    Entries before: ${rows.length}`);

  backupFile(filePath);
  log(`    Backup created`);

  let enriched = 0, fieldsAdded = 0;
  for (const entry of rows) {
    const id = codeToId(entry.code);
    const bigEntry = bigMap.get(id);
    if (bigEntry) {
      const added = enrichEntry(entry, bigEntry);
      if (added > 0) { enriched++; fieldsAdded += added; }
    }
  }

  writeJson(filePath, raw);

  const afterCount = Array.isArray(raw) ? raw.length : raw.rows.length;
  log(`    Entries after:  ${afterCount}`);
  log(`    Entries enriched: ${enriched}`);
  log(`    Fields added:     ${fieldsAdded}`);

  if (rows.length !== afterCount) {
    log(`    *** ERROR: Count changed!`);
    process.exit(1);
  }
}

// ─── 4. Enrich CSV files with Description columns ────────────────────────────

log('\n=== Enriching CSV files ===');

/**
 * Parse a simple CSV (handles quoted commas).
 * Returns { headers: string[], rows: string[][] }
 */
function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result = [];
  for (const line of lines) {
    if (line.trim() === '') { result.push([]); continue; }
    const row = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = !inQuote; }
      } else if (ch === ',' && !inQuote) {
        row.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    row.push(cur);
    result.push(row);
  }
  return result;
}

function serializeCsv(rows) {
  return rows.map(row =>
    row.map(cell => {
      if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
        return '"' + cell.replace(/"/g, '""') + '"';
      }
      return cell;
    }).join(',')
  ).join('\r\n');
}

// CSV files that have (typeId_col, partId_col) structure
// Format: { file, typeIdCol, partIdCol, checkDescription }
const CSV_TARGETS = [
  // shield
  { file: path.join(ROOT, 'shield', 'shield_main_perk_EN.csv'),    typeIdCol: 'Shield_perk_main_ID', partIdCol: 'Part_ID' },
  { file: path.join(ROOT, 'shield', 'manufacturer_perk_EN.csv'),   typeIdCol: 'Manufacturer ID',     partIdCol: 'Part_ID' },
  // grenade
  { file: path.join(ROOT, 'grenade', 'grenade_main_perk_EN.csv'),  typeIdCol: 'Grenade_perk_main_ID',partIdCol: 'Part_ID' },
  { file: path.join(ROOT, 'grenade', 'manufacturer_rarity_perk_EN.csv'), typeIdCol: 'Manufacturer ID', partIdCol: 'Part_ID' },
  // repkit
  { file: path.join(ROOT, 'repkit', 'repkit_main_perk_EN.csv'),    typeIdCol: 'Repkit_perk_main_ID', partIdCol: 'Part_ID' },
  { file: path.join(ROOT, 'repkit', 'repkit_manufacturer_perk_EN.csv'), typeIdCol: 'Manufacturer ID', partIdCol: 'Part_ID' },
  // heavy
  { file: path.join(ROOT, 'heavy', 'heavy_main_perk_EN.csv'),      typeIdCol: 'Heavy_perk_main_ID',  partIdCol: 'Part_ID' },
  { file: path.join(ROOT, 'heavy', 'heavy_manufacturer_perk_EN.csv'), typeIdCol: 'Manufacturer ID',  partIdCol: 'Part_ID' },
  // enhancement
  { file: path.join(ROOT, 'enhancement', 'Enhancement_perk.csv'),  typeIdCol: 'manufacturers_ID',    partIdCol: 'perk_ID' },
  { file: path.join(ROOT, 'enhancement', 'Enhancement_manufacturers.csv'), typeIdCol: 'manufacturers_ID', partIdCol: 'perk_ID' },
];

for (const target of CSV_TARGETS) {
  const { file, typeIdCol, partIdCol } = target;
  if (!fs.existsSync(file)) {
    log(`  SKIP (not found): ${path.relative(ROOT, file)}`);
    continue;
  }

  const text = fs.readFileSync(file, 'utf8');
  const rows = parseCsv(text);
  if (rows.length < 2) continue;

  const headers = rows[0];
  const typeIdIdx = headers.indexOf(typeIdCol);
  const partIdIdx = headers.indexOf(partIdCol);

  if (typeIdIdx === -1 || partIdIdx === -1) {
    log(`  SKIP (missing columns): ${path.relative(ROOT, file)}`);
    continue;
  }

  // Check if Description column already exists
  const descIdx = headers.indexOf('Description');
  // We'll add a "BigEditor_Effects" column if there are matched effects
  // and a "BigEditor_Description" column if description is richer

  // First pass: determine what data we have
  let matchedEffects = 0, matchedDescription = 0, matchedSpawnCode = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const typeId = row[typeIdIdx];
    const partId = row[partIdIdx];
    if (!typeId || !partId) continue;
    const id = `${typeId}:${partId}`;
    const big = bigMap.get(id);
    if (!big) continue;
    if (big.effects && big.effects.trim()) matchedEffects++;
    if (big.description && big.description.trim()) matchedDescription++;
    if (big.spawn_code && big.spawn_code.trim()) matchedSpawnCode++;
  }

  const relFile = path.relative(ROOT, file);
  log(`\n  CSV: ${relFile}`);
  log(`    Data rows: ${rows.length - 1}`);
  log(`    Rows matching big editor (with effects): ${matchedEffects}`);
  log(`    Rows matching big editor (with description): ${matchedDescription}`);
  log(`    Rows matching big editor (with spawn_code): ${matchedSpawnCode}`);

  if (matchedEffects === 0 && matchedDescription === 0 && matchedSpawnCode === 0) {
    log(`    No enrichable data found — skipping`);
    continue;
  }

  // Back up before modifying
  backupFile(file);
  log(`    Backup created`);

  // Determine which new columns to add
  const newCols = [];
  if (matchedEffects > 0 && !headers.includes('BigEditor_Effects')) {
    newCols.push('BigEditor_Effects');
  }
  if (matchedSpawnCode > 0 && !headers.includes('SpawnCode')) {
    newCols.push('SpawnCode');
  }
  // Only add BigEditor_Description if Description column is mostly empty
  const descColEmpty = descIdx === -1 || rows.slice(1).filter(r => r[descIdx] && r[descIdx].trim()).length < 3;
  if (matchedDescription > 0 && descColEmpty && !headers.includes('BigEditor_Description')) {
    newCols.push('BigEditor_Description');
  }

  if (newCols.length === 0) {
    log(`    Columns already present or no new columns needed — skipping`);
    continue;
  }

  log(`    Adding columns: ${newCols.join(', ')}`);

  // Add empty headers
  for (const col of newCols) {
    headers.push(col);
  }

  let rowsEnriched = 0;
  // Second pass: fill values
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) {
      // Pad to header length for empty rows
      while (row && row.length < headers.length) row.push('');
      continue;
    }
    // Pad row to current header count (before new cols we're about to add)
    while (row.length < headers.length - newCols.length) row.push('');

    const typeId = row[typeIdIdx];
    const partId = row[partIdIdx];
    const id = `${typeId}:${partId}`;
    const big = bigMap.get(id);

    let rowAdded = 0;
    for (const col of newCols) {
      if (col === 'BigEditor_Effects') {
        const val = (big && big.effects) ? big.effects.trim() : '';
        row.push(val);
        if (val) rowAdded++;
      } else if (col === 'SpawnCode') {
        const val = (big && big.spawn_code) ? big.spawn_code.trim() : '';
        row.push(val);
        if (val) rowAdded++;
      } else if (col === 'BigEditor_Description') {
        const val = (big && big.description) ? big.description.trim() : '';
        row.push(val);
        if (val) rowAdded++;
      } else {
        row.push('');
      }
    }
    if (rowAdded > 0) rowsEnriched++;
  }

  const newText = serializeCsv(rows);
  fs.writeFileSync(file, newText, 'utf8');
  log(`    Rows enriched: ${rowsEnriched}`);
}

// ─── 5. Write enrichment report ──────────────────────────────────────────────

log('\n=== Summary ===');
log(`api/data/parts.json: ${apiCountBefore} entries (unchanged), ${apiEntriesEnriched} enriched, ${apiFieldsAdded} fields added`);
log(`universal_parts_db.json: ${universalCountBefore} entries (unchanged), ${uniEntriesEnriched} enriched, ${uniFieldsAdded} fields added`);

const reportPath = path.join(ROOT, 'scripts', 'enrichment_report.txt');
const reportText = [
  'ENRICHMENT REPORT',
  '=================',
  `Date: ${new Date().toISOString()}`,
  `Source: scripts/big_editor_parts_flat.json (${bigParts.length} parts)`,
  '',
  ...report
].join('\n');

fs.writeFileSync(reportPath, reportText, 'utf8');
console.log(`\nReport written to: ${reportPath}`);
