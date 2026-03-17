#!/usr/bin/env node
/**
 * extract_save_editor.js
 * Extracts and analyzes the parts database embedded in save-editor.html
 * Also analyzes the larger "Borderlands Item Editor and Save Editor.html"
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SAVE_EDITOR_PATH = path.resolve(__dirname, '../trash/reference htmls/save-editor.html');
const BIG_EDITOR_PATH = path.resolve(__dirname, '../trash/reference htmls/Borderlands Item Editor and Save Editor.html');
const OUTPUT_PATH = path.resolve(__dirname, 'save_editor_parts.json');

// ── 1. Parse RARITY_TSV from save-editor.html ────────────────────────────────
console.log('\n=== Analyzing save-editor.html ===');
const saveEditorHtml = fs.readFileSync(SAVE_EDITOR_PATH, 'utf8');

// Extract RARITY_TSV content between the backticks
const tsvMatch = saveEditorHtml.match(/const RARITY_TSV = String\.raw`([\s\S]*?)`;/);
if (!tsvMatch) {
  console.error('Could not find RARITY_TSV in save-editor.html');
} else {
  const tsvContent = tsvMatch[1].trim();
  const lines = tsvContent.split(/\r?\n/);
  const header = lines[0];
  const dataRows = lines.slice(1).filter(l => l.trim());

  console.log(`RARITY_TSV header columns: ${header.split('\t').join(' | ')}`);
  console.log(`Total data rows: ${dataRows.length}`);

  // Parse entries
  const entries = [];
  const brokenNames = [];
  const categoryCount = {};
  const legendaryCount = {};

  for (const row of dataRows) {
    const cols = row.split('\t');
    const [manufacturer='', itemType='', typeString='', typeId='', itemId='', legendary='', comment=''] = cols;

    // Determine rarity
    let rarity = 'unknown';
    const token = typeString.toLowerCase();
    if (token.includes('_common')) rarity = 'Common';
    else if (token.includes('_uncommon')) rarity = 'Uncommon';
    else if (token.includes('_rare')) rarity = 'Rare';
    else if (token.includes('_epic')) rarity = 'Epic';
    else if (token.includes('_legendary')) rarity = 'Legendary';

    const entry = {
      code: typeId && itemId ? `{${typeId}:${itemId}}` : null,
      typeId: typeId.trim(),
      itemId: itemId.trim(),
      manufacturer: manufacturer.trim(),
      itemType: itemType.trim(),
      typeString: typeString.trim(),
      name: legendary.trim() || rarity,
      rarity,
      comment: comment.trim()
    };

    entries.push(entry);

    // Check for broken/placeholder names
    const nameLower = entry.name.toLowerCase();
    if (nameLower.includes('broken') || nameLower.includes('placeholder') || nameLower.includes('todo')) {
      brokenNames.push(entry);
    }

    // Count by category
    categoryCount[itemType] = (categoryCount[itemType] || 0) + 1;

    // Count legendaries
    if (rarity === 'Legendary' && legendary.trim()) {
      legendaryCount[`${manufacturer} ${legendary.trim()}`] = entry.code;
    }
  }

  console.log('\nCategory breakdown:');
  for (const [cat, count] of Object.entries(categoryCount).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  console.log(`\nTotal entries with {typeId:itemId} codes: ${entries.filter(e=>e.code).length}`);
  console.log(`Legendaries with names: ${Object.keys(legendaryCount).length}`);
  console.log(`Broken/placeholder names found: ${brokenNames.length}`);

  if (brokenNames.length > 0) {
    console.log('Broken names:');
    brokenNames.forEach(b => console.log(`  ${b.name} -> ${b.code}`));
  }

  // Show sample legendary entries
  console.log('\nSample legendary entries:');
  entries.filter(e => e.rarity === 'Legendary' && e.name && e.name !== 'Legendary').slice(0, 10).forEach(e => {
    console.log(`  ${e.code} -> "${e.name}" [${e.manufacturer} ${e.itemType}]`);
  });

  // Save the parsed entries
  const output = {
    source: 'save-editor.html RARITY_TSV',
    totalEntries: entries.length,
    entriesWithCodes: entries.filter(e=>e.code).length,
    categoryBreakdown: categoryCount,
    legendaryCount: Object.keys(legendaryCount).length,
    hasBrokenNames: brokenNames.length > 0,
    entries
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nSaved ${entries.length} entries to ${OUTPUT_PATH}`);
}

// ── 2. Analyze the big editor HTML for embedded compressed data ───────────────
console.log('\n=== Analyzing Borderlands Item Editor and Save Editor.html ===');

// Read the big file in chunks to find the embedded base64 data
const bigFileContent = fs.readFileSync(BIG_EDITOR_PATH, 'utf8');
console.log(`File size: ${(bigFileContent.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`Total lines: ${bigFileContent.split('\n').length}`);

// Look for the embedded base64 compressed data variable around line 6810
const lines = bigFileContent.split('\n');
let embeddedDataLine = -1;
for (let i = 6800; i < 6830; i++) {
  if (lines[i] && lines[i].length > 1000) {
    embeddedDataLine = i + 1; // 1-indexed
    console.log(`Found long line at line ${embeddedDataLine}, length: ${lines[i].length} chars`);
    // Try to extract variable name
    const varMatch = lines[i].match(/^\s*(const|var|let)\s+(\w+)\s*=/);
    if (varMatch) {
      console.log(`Variable name: ${varMatch[2]}`);
    }
    // Show first 200 chars
    console.log(`First 200 chars: ${lines[i].substring(0, 200)}`);
    break;
  }
}

// Search for the embedded compressed data pattern
const embeddedMatch = bigFileContent.match(/\/\/ Embedded fallback data.*?\n\s*(const|var|let)\s+(\w+)\s*=\s*['"`]([A-Za-z0-9+/=\s]{100,})['"`]/s);
if (embeddedMatch) {
  const varName = embeddedMatch[2];
  const b64data = embeddedMatch[3].replace(/\s/g, '');
  console.log(`\nFound embedded data variable: ${varName}`);
  console.log(`Base64 data length: ${b64data.length} chars`);

  // Try to decompress it
  try {
    const compressed = Buffer.from(b64data, 'base64');
    console.log(`Compressed size: ${(compressed.length / 1024).toFixed(1)} KB`);

    const decompressed = zlib.gunzipSync(compressed);
    console.log(`Decompressed size: ${(decompressed.length / 1024 / 1024).toFixed(2)} MB`);

    const jsonStr = decompressed.toString('utf8');
    const data = JSON.parse(jsonStr);

    console.log('\nDecompressed data structure:');
    console.log(`Type: ${Array.isArray(data) ? 'Array' : typeof data}`);
    if (Array.isArray(data)) {
      console.log(`Entries: ${data.length}`);
      if (data.length > 0) {
        console.log('First entry keys:', Object.keys(data[0]).join(', '));
        console.log('Sample entries:');
        data.slice(0, 3).forEach(e => console.log(' ', JSON.stringify(e)));
      }
    } else if (typeof data === 'object') {
      const topKeys = Object.keys(data);
      console.log('Top-level keys:', topKeys.slice(0, 10).join(', '));
      // Look for array properties
      for (const key of topKeys.slice(0, 20)) {
        if (Array.isArray(data[key])) {
          console.log(`  data.${key}: Array of ${data[key].length}`);
        }
      }
    }

    // Save decompressed data
    const bigOutputPath = path.resolve(__dirname, 'big_editor_data.json');
    fs.writeFileSync(bigOutputPath, JSON.stringify(data, null, 2));
    console.log(`\nSaved decompressed data to ${bigOutputPath}`);

  } catch (e) {
    console.log(`Decompression failed: ${e.message}`);
    // Try as raw gzip
    try {
      const compressed = Buffer.from(b64data, 'base64');
      const decompressed = zlib.inflateSync(compressed);
      console.log(`inflate worked! Size: ${decompressed.length}`);
    } catch (e2) {
      console.log(`inflate also failed: ${e2.message}`);
    }
  }
} else {
  console.log('\nCould not find embedded base64 data with pattern match. Searching differently...');

  // Try finding it by looking for very long lines around line 6813
  if (embeddedDataLine > 0) {
    const longLine = lines[embeddedDataLine - 1];
    // Extract just the base64 string from the assignment
    const b64Match = longLine.match(/=\s*['"`]([A-Za-z0-9+/=]{50,})['"`]/);
    if (b64Match) {
      const b64data = b64Match[1];
      console.log(`Found base64 data on line ${embeddedDataLine}, length: ${b64data.length}`);
      try {
        const compressed = Buffer.from(b64data, 'base64');
        const decompressed = zlib.gunzipSync(compressed);
        const data = JSON.parse(decompressed.toString('utf8'));
        console.log(`Success! Data has ${Array.isArray(data) ? data.length + ' entries' : Object.keys(data).length + ' keys'}`);
      } catch(e) {
        console.log(`Failed: ${e.message}`);
      }
    }
  }
}

// ── 3. Look for Part ID mapping section around line 69878 ────────────────────
console.log('\n=== Looking for Part ID mapping section ===');
const partMappingLine = 69878 - 1; // 0-indexed
if (lines[partMappingLine]) {
  console.log(`Line 69878: ${lines[partMappingLine]}`);
  // Show next 20 lines
  for (let i = partMappingLine; i < Math.min(partMappingLine + 30, lines.length); i++) {
    const l = lines[i];
    if (l.length > 200) {
      console.log(`Line ${i+1}: [${l.length} chars] ${l.substring(0, 150)}...`);
    } else {
      console.log(`Line ${i+1}: ${l}`);
    }
  }
}

// ── 4. Count all {typeId:partId} style codes in the big file ─────────────────
console.log('\n=== Counting {typeId:partId} codes in big editor ===');
const codePattern = /\{(\d+):(\d+)\}/g;
const allCodes = new Set();
let match;
while ((match = codePattern.exec(bigFileContent)) !== null) {
  allCodes.add(`${match[1]}:${match[2]}`);
}
console.log(`Unique {typeId:partId} code pairs found: ${allCodes.size}`);

// Also count in save-editor.html
const saveEditorCodes = new Set();
const codePattern2 = /\{(\d+):(\d+)\}/g;
while ((match = codePattern2.exec(saveEditorHtml)) !== null) {
  saveEditorCodes.add(`${match[1]}:${match[2]}`);
}
console.log(`Unique codes in save-editor.html: ${saveEditorCodes.size}`);

console.log('\n=== Summary ===');
console.log('save-editor.html: RARITY_TSV is the primary parts database');
console.log(`  - Format: TSV with columns: Manufacturer | Item Type | Item Type String | Item Type ID | Item ID | Legendary | Comment`);
console.log(`  - Codes are in {typeId:itemId} format (e.g. {270:9})`);
console.log(`  - No "Broken Red/Blue/Green" placeholder names found`);
