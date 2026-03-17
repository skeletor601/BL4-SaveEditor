#!/usr/bin/env node
/**
 * analyze_big_editor.js
 * Recursively counts and catalogs all parts in big_editor_data.json
 * (decompressed from EMBEDDED_GAME_DATA_BASE64 in Borderlands Item Editor and Save Editor.html)
 */

const fs = require('fs');
const path = require('path');

const BIG_DATA_PATH = path.resolve(__dirname, 'big_editor_data.json');
const OUT_PATH = path.resolve(__dirname, 'big_editor_parts_flat.json');

const data = JSON.parse(fs.readFileSync(BIG_DATA_PATH, 'utf8'));

console.log('metadata:', JSON.stringify(data.metadata, null, 2));
console.log('id_index total keys:', Object.keys(data.id_index).length);

// Recursively collect all part objects that have an `id` matching `\d+:\d+`
const codeToEntry = {};

function collectParts(obj, depth) {
  if (!obj || typeof obj !== 'object' || depth > 15) return;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === 'object' && item.id && typeof item.id === 'string' && /^\d+:\d+$/.test(item.id)) {
        codeToEntry[item.id] = item;
      } else {
        collectParts(item, depth + 1);
      }
    }
    return;
  }
  // Check if this object itself is a part entry
  if (obj.id && typeof obj.id === 'string' && /^\d+:\d+$/.test(obj.id) && obj.name !== undefined) {
    codeToEntry[obj.id] = obj;
    return;
  }
  for (const key of Object.keys(obj)) {
    if (key === 'metadata' || key === 'id_index') continue;
    collectParts(obj[key], depth + 1);
  }
}

collectParts({ weapons: data.weapons, gadgets: data.gadgets, characters: data.characters }, 0);

const allParts = Object.values(codeToEntry);
console.log('\nTotal unique part codes:', allParts.length);

// Show field names
if (allParts.length > 0) {
  console.log('Fields:', Object.keys(allParts[0]).join(', '));
}

// Category breakdown
const catCount = {};
const rarityCount = {};
const brokenNames = [];

for (const entry of allParts) {
  const cat = entry.category || 'unknown';
  catCount[cat] = (catCount[cat] || 0) + 1;

  // Check for broken placeholder names
  const nameLower = (entry.name || '').toLowerCase();
  if (nameLower.includes('broken') || nameLower.includes('placeholder') || nameLower.includes('todo')) {
    brokenNames.push(entry);
  }

  // Rarity (from name or other fields)
  const rarity = entry.rarity || (entry.name && (
    entry.name.toLowerCase().includes('legendary') ? 'Legendary' :
    entry.name.toLowerCase().includes('epic') ? 'Epic' :
    entry.name.toLowerCase().includes('rare') ? 'Rare' :
    entry.name.toLowerCase().includes('uncommon') ? 'Uncommon' :
    entry.name.toLowerCase().includes('common') ? 'Common' : 'unknown'
  )) || 'unknown';
  rarityCount[rarity] = (rarityCount[rarity] || 0) + 1;
}

console.log('\nCategory breakdown:');
for (const [cat, count] of Object.entries(catCount).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${cat}: ${count}`);
}

console.log('\nBroken/placeholder names:', brokenNames.length);
if (brokenNames.length > 0) {
  brokenNames.slice(0, 10).forEach(e => console.log(`  ${e.id}: "${e.name}"`));
}

// Sample entries per major category/type
console.log('\nSample entries (first 5 with spawn_code and name):');
allParts.filter(e => e.spawn_code && e.name).slice(0, 5).forEach(e => {
  console.log(`  ${e.id} | ${e.spawn_code} | name:"${e.name}" | desc:"${(e.description||'').substring(0,50)}"`);
});

// Entries with legendary_name
const legendaryParts = allParts.filter(e => e.legendary_name && e.legendary_name.trim());
console.log('\nParts with legendary_name:', legendaryParts.length);
legendaryParts.slice(0, 10).forEach(e => {
  console.log(`  ${e.id} -> "${e.legendary_name}" [${e.spawn_code}]`);
});

// Type IDs present
const typeIds = new Set(allParts.map(e => e.id.split(':')[0]));
console.log('\nType IDs present:', [...typeIds].sort((a,b)=>parseInt(a)-parseInt(b)).join(', '));

// Compare with our DB
console.log('\n=== Comparison with our DB ===');
console.log('Our DB (current): 9,621 entries');
console.log('save-editor.html RARITY_TSV: 440 entries (manufacturer-rarity lookups only)');
console.log(`big editor embedded data: ${allParts.length} entries (id_index has ${Object.keys(data.id_index).length} codes)`);

// Save flat parts
fs.writeFileSync(OUT_PATH, JSON.stringify({
  source: 'Borderlands Item Editor and Save Editor.html (EMBEDDED_GAME_DATA_BASE64, gzip+base64)',
  decompressedSizeMB: '3.00',
  metadata: data.metadata,
  totalUniqueCodes: allParts.length,
  idIndexTotal: Object.keys(data.id_index).length,
  fields: allParts.length > 0 ? Object.keys(allParts[0]) : [],
  categoryBreakdown: catCount,
  hasBrokenNames: brokenNames.length > 0,
  parts: allParts
}, null, 2));
console.log(`\nSaved ${allParts.length} entries to ${OUT_PATH}`);
