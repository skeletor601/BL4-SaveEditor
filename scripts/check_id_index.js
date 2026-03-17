#!/usr/bin/env node
/**
 * check_id_index.js
 * Checks what IDs are in id_index but not found as flat parts,
 * and resolves them by following path references in the data structure.
 */

const fs = require('fs');
const path = require('path');

const BIG_DATA_PATH = path.resolve(__dirname, 'big_editor_data.json');
const FLAT_DATA_PATH = path.resolve(__dirname, 'big_editor_parts_flat.json');

const data = JSON.parse(fs.readFileSync(BIG_DATA_PATH, 'utf8'));
const flatData = JSON.parse(fs.readFileSync(FLAT_DATA_PATH, 'utf8'));

const idIndexKeys = new Set(Object.keys(data.id_index));
const flatKeys = new Set(flatData.parts.map(p => p.id));

const missing = [...idIndexKeys].filter(k => !flatKeys.has(k));
console.log('IDs in id_index:', idIndexKeys.size);
console.log('IDs found as actual parts:', flatKeys.size);
console.log('IDs in id_index but not found as parts:', missing.length);
console.log('Sample missing IDs:', missing.slice(0, 20));

// Look at what the id_index entries point to
console.log('\nSample id_index entries (missing ones):');
for (const k of missing.slice(0, 15)) {
  const ref = data.id_index[k];
  console.log(k, '->', JSON.stringify(ref));
}

// Try to resolve one path
function resolvePath(obj, pathStr) {
  const parts = pathStr.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return null;
    cur = cur[part];
  }
  return cur;
}

// Resolve a sample missing entry
console.log('\nResolving sample paths:');
for (const k of missing.slice(0, 5)) {
  const ref = data.id_index[k];
  if (ref && ref.path) {
    const resolved = resolvePath(data, ref.path);
    if (resolved) {
      console.log(`${k}: path="${ref.path}" -> ${JSON.stringify(resolved).substring(0, 100)}`);
    } else {
      console.log(`${k}: path="${ref.path}" -> NOT RESOLVED`);
    }
  }
}

// Check what type IDs the missing ones correspond to
const missingTypeIds = {};
for (const k of missing) {
  const typeId = k.split(':')[0];
  missingTypeIds[typeId] = (missingTypeIds[typeId] || 0) + 1;
}
console.log('\nMissing entries by type ID:');
for (const [tid, cnt] of Object.entries(missingTypeIds).sort((a,b) => parseInt(a[0])-parseInt(b[0]))) {
  console.log(`  TypeId ${tid}: ${cnt} missing`);
}
