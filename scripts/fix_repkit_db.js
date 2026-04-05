/**
 * One-time script: Replace all manufacturer repkit entries in universal_parts_db.json
 * with corrected, complete entries sourced from NCS data + CSV cross-reference.
 *
 * Every entry gets: partName, manufacturer, rarity, effect (description), internalName
 */

const fs = require("fs");
const dbPath = "master_search/db/universal_parts_db.json";
const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
const rows = db.rows;

// Remove ALL existing repkit entries from manufacturer typeIds
const mfgTypeIds = new Set(["261", "265", "266", "269", "274", "277", "285", "290"]);
const kept = rows.filter(r => {
  if (r.category !== "Repkit") return true;
  const tid = (r.code || "").match(/\{(\d+):/)?.[1];
  return !mfgTypeIds.has(tid);
});

// Also remove the universal Geiger-Roid legendary perks (243:115-119) since they're on Maliwan now
const geigerIds = new Set(["{243:115}", "{243:116}", "{243:117}", "{243:118}", "{243:119}"]);
const final = kept.filter(r => !geigerIds.has(r.code));

const removed = rows.length - final.length;
console.log(`Removed ${removed} old manufacturer repkit entries`);

const newEntries = [
  // ═══════════════════════════════════════════════════════════════════
  // DAEDALUS (277) — Model: Stim
  // Legendary 1: Pulseometer → Pacemaker Skin
  // Legendary 2: Soothing → Healthraiser Skin
  // ═══════════════════════════════════════════════════════════════════
  { code: "{277:1}", partName: "Pulseometer", itemType: "Pulseometer", category: "Repkit", partType: "Legendary Perk", manufacturer: "Daedalus", rarity: "Legendary", effect: "Continuously passively regenerates Health, rate increases when Health is low", internalName: "part_augment_unique_pacemaker" },
  { code: "{277:2}", partName: "Stim", itemType: "Stim", category: "Repkit", partType: "Model", manufacturer: "Daedalus", effect: "1562/2900 Heal, 8s/20s Cooldown", internalName: "part_dad" },
  { code: "{277:3}", partName: "Common", itemType: "Common", category: "Repkit", partType: "Rarity", manufacturer: "Daedalus", rarity: "Common", internalName: "comp_01_common" },
  { code: "{277:4}", partName: "Uncommon", itemType: "Uncommon", category: "Repkit", partType: "Rarity", manufacturer: "Daedalus", rarity: "Uncommon", internalName: "comp_02_uncommon" },
  { code: "{277:5}", partName: "Rare", itemType: "Rare", category: "Repkit", partType: "Rarity", manufacturer: "Daedalus", rarity: "Rare", internalName: "comp_03_rare" },
  { code: "{277:6}", partName: "Epic", itemType: "Epic", category: "Repkit", partType: "Rarity", manufacturer: "Daedalus", rarity: "Epic", internalName: "comp_04_epic" },
  { code: "{277:7}", partName: "Pacemaker", itemType: "Pacemaker", category: "Repkit", partType: "Rarity", manufacturer: "Daedalus", rarity: "Legendary", effect: "Pacemaker Skin", internalName: "comp_05_legendary_pacemaker" },
  { code: "{277:8}", partName: "Soothing", itemType: "Soothing", category: "Repkit", partType: "Legendary Perk", manufacturer: "Daedalus", rarity: "Legendary", effect: "Spawns Health Boosters when Repkit starts and ends", internalName: "part_augment_unique_healthraiser" },
  { code: "{277:9}", partName: "Healthraiser", itemType: "Healthraiser", category: "Repkit", partType: "Rarity", manufacturer: "Daedalus", rarity: "Legendary", effect: "Healthraiser Skin", internalName: "comp_05_legendary_healthraiser" },

  // ═══════════════════════════════════════════════════════════════════
  // JAKOBS (265) — Model: Tonic
  // Legendary: Cardiac Shot → Defibrillator Skin
  // ═══════════════════════════════════════════════════════════════════
  { code: "{265:1}", partName: "Common", itemType: "Common", category: "Repkit", partType: "Rarity", manufacturer: "Jakobs", rarity: "Common", internalName: "comp_01_common" },
  { code: "{265:2}", partName: "Uncommon", itemType: "Uncommon", category: "Repkit", partType: "Rarity", manufacturer: "Jakobs", rarity: "Uncommon", internalName: "comp_02_uncommon" },
  { code: "{265:3}", partName: "Rare", itemType: "Rare", category: "Repkit", partType: "Rarity", manufacturer: "Jakobs", rarity: "Rare", internalName: "comp_03_rare" },
  { code: "{265:4}", partName: "Epic", itemType: "Epic", category: "Repkit", partType: "Rarity", manufacturer: "Jakobs", rarity: "Epic", internalName: "comp_04_epic" },
  { code: "{265:5}", partName: "Defibrillator", itemType: "Defibrillator", category: "Repkit", partType: "Rarity", manufacturer: "Jakobs", rarity: "Legendary", effect: "Defibrillator Skin", internalName: "comp_05_legendary_defibrillator" },
  { code: "{265:6}", partName: "Cardiac Shot", itemType: "Cardiac Shot", category: "Repkit", partType: "Legendary Perk", manufacturer: "Jakobs", rarity: "Legendary", effect: "When Health is below 20%, has a 50% chance to refill 1 Repkit Charge", internalName: "part_augment_unique_defibrillator" },
  { code: "{265:7}", partName: "Tonic", itemType: "Tonic", category: "Repkit", partType: "Model", manufacturer: "Jakobs", effect: "4461 Heal, 24s Cooldown", internalName: "part_jak" },

  // ═══════════════════════════════════════════════════════════════════
  // MALIWAN (266) — Model: Refresher
  // Legendary 1: Immunity Shot → Blood Analyzer Skin
  // Legendary 2: Geiger-Roid → Geiger-Roid Skin (5 elemental variants)
  // ═══════════════════════════════════════════════════════════════════
  { code: "{266:1}", partName: "Common", itemType: "Common", category: "Repkit", partType: "Rarity", manufacturer: "Maliwan", rarity: "Common", internalName: "comp_01_common" },
  { code: "{266:2}", partName: "Uncommon", itemType: "Uncommon", category: "Repkit", partType: "Rarity", manufacturer: "Maliwan", rarity: "Uncommon", internalName: "comp_02_uncommon" },
  { code: "{266:3}", partName: "Rare", itemType: "Rare", category: "Repkit", partType: "Rarity", manufacturer: "Maliwan", rarity: "Rare", internalName: "comp_03_rare" },
  { code: "{266:4}", partName: "Epic", itemType: "Epic", category: "Repkit", partType: "Rarity", manufacturer: "Maliwan", rarity: "Epic", internalName: "comp_04_epic" },
  { code: "{266:5}", partName: "Blood Analyzer", itemType: "Blood Analyzer", category: "Repkit", partType: "Rarity", manufacturer: "Maliwan", rarity: "Legendary", effect: "Blood Analyzer Skin", internalName: "comp_05_legendary_bloodanalyzer" },
  { code: "{266:6}", partName: "Immunity Shot", itemType: "Immunity Shot", category: "Repkit", partType: "Legendary Perk", manufacturer: "Maliwan", rarity: "Legendary", effect: "On use, grants immunity to the last received Elemental Damage type for 7 seconds", internalName: "part_augment_unique_bloodanalyzer" },
  { code: "{266:7}", partName: "Refresher", itemType: "Refresher", category: "Repkit", partType: "Model", manufacturer: "Maliwan", effect: "2900/1562 Heal, 8s/20s Cooldown", internalName: "part_mal" },
  { code: "{266:8}", partName: "Geiger-Roid", itemType: "Geiger-Roid", category: "Repkit", partType: "Rarity", manufacturer: "Maliwan", rarity: "Legendary", effect: "Roid Rage: On Use applies stacks that decay over time spawning elemental Novas. Red Text: This is the part where you run.", internalName: "comp_05_legendary_geigerroid" },
  { code: "{266:115}", partName: "Geiger-Roid (Shock)", itemType: "Geiger-Roid (Shock)", category: "Repkit", partType: "Legendary Perk", manufacturer: "Maliwan", rarity: "Legendary", effect: "Roid Rage — Shock elemental Nova variant", internalName: "part_aug_unique_geigerroid_shock_sec" },
  { code: "{266:116}", partName: "Geiger-Roid (Radiation)", itemType: "Geiger-Roid (Radiation)", category: "Repkit", partType: "Legendary Perk", manufacturer: "Maliwan", rarity: "Legendary", effect: "Roid Rage — Radiation elemental Nova variant", internalName: "part_aug_unique_geigerroid_radiation_sec" },
  { code: "{266:117}", partName: "Geiger-Roid (Fire)", itemType: "Geiger-Roid (Fire)", category: "Repkit", partType: "Legendary Perk", manufacturer: "Maliwan", rarity: "Legendary", effect: "Roid Rage — Fire elemental Nova variant", internalName: "part_aug_unique_geigerroid_fire_sec" },
  { code: "{266:118}", partName: "Geiger-Roid (Cryo)", itemType: "Geiger-Roid (Cryo)", category: "Repkit", partType: "Legendary Perk", manufacturer: "Maliwan", rarity: "Legendary", effect: "Roid Rage — Cryo elemental Nova variant", internalName: "part_aug_unique_geigerroid_cryo_sec" },
  { code: "{266:119}", partName: "Geiger-Roid (Corrosive)", itemType: "Geiger-Roid (Corrosive)", category: "Repkit", partType: "Legendary Perk", manufacturer: "Maliwan", rarity: "Legendary", effect: "Roid Rage — Corrosive elemental Nova variant", internalName: "part_aug_unique_geigerroid_corrosive_sec" },

  // ═══════════════════════════════════════════════════════════════════
  // VLADOF (269) — Model: Sobirat
  // Legendary: Blood Rush → Adrenaline Pump Skin
  // ═══════════════════════════════════════════════════════════════════
  { code: "{269:1}", partName: "Common", itemType: "Common", category: "Repkit", partType: "Rarity", manufacturer: "Vladof", rarity: "Common", internalName: "comp_01_common" },
  { code: "{269:2}", partName: "Uncommon", itemType: "Uncommon", category: "Repkit", partType: "Rarity", manufacturer: "Vladof", rarity: "Uncommon", internalName: "comp_02_uncommon" },
  { code: "{269:3}", partName: "Rare", itemType: "Rare", category: "Repkit", partType: "Rarity", manufacturer: "Vladof", rarity: "Rare", internalName: "comp_03_rare" },
  { code: "{269:4}", partName: "Epic", itemType: "Epic", category: "Repkit", partType: "Rarity", manufacturer: "Vladof", rarity: "Epic", internalName: "comp_04_epic" },
  { code: "{269:5}", partName: "Adrenaline Pump", itemType: "Adrenaline Pump", category: "Repkit", partType: "Rarity", manufacturer: "Vladof", rarity: "Legendary", effect: "Adrenaline Pump Skin", internalName: "comp_05_legendary_adrenalinepump" },
  { code: "{269:6}", partName: "Blood Rush", itemType: "Blood Rush", category: "Repkit", partType: "Legendary Perk", manufacturer: "Vladof", rarity: "Legendary", effect: "Automatically regenerates Health during Fight For Your Life", internalName: "part_augment_unique_adrenalinepump" },
  { code: "{269:7}", partName: "Sobirat", itemType: "Sobirat", category: "Repkit", partType: "Model", manufacturer: "Vladof", effect: "2082 Heal, 16s Cooldown", internalName: "part_vla" },

  // ═══════════════════════════════════════════════════════════════════
  // RIPPER (274) — Model: Scabber
  // Legendary: Time Dilation → AF1000 Skin
  // ═══════════════════════════════════════════════════════════════════
  { code: "{274:1}", partName: "Time Dilation", itemType: "Time Dilation", category: "Repkit", partType: "Legendary Perk", manufacturer: "Ripper", rarity: "Legendary", effect: "Repkit Duration increased by +100%, and Cooldown reduced by -50%", internalName: "part_augment_unique_augmenter" },
  { code: "{274:2}", partName: "Scabber", itemType: "Scabber", category: "Repkit", partType: "Model", manufacturer: "Ripper", effect: "5949 Heal, 10s/20s Cooldown", internalName: "part_borg" },
  { code: "{274:3}", partName: "Common", itemType: "Common", category: "Repkit", partType: "Rarity", manufacturer: "Ripper", rarity: "Common", internalName: "comp_01_common" },
  { code: "{274:4}", partName: "Uncommon", itemType: "Uncommon", category: "Repkit", partType: "Rarity", manufacturer: "Ripper", rarity: "Uncommon", internalName: "comp_02_uncommon" },
  { code: "{274:5}", partName: "Rare", itemType: "Rare", category: "Repkit", partType: "Rarity", manufacturer: "Ripper", rarity: "Rare", internalName: "comp_03_rare" },
  { code: "{274:6}", partName: "Epic", itemType: "Epic", category: "Repkit", partType: "Rarity", manufacturer: "Ripper", rarity: "Epic", internalName: "comp_04_epic" },
  { code: "{274:7}", partName: "AF1000", itemType: "AF1000", category: "Repkit", partType: "Rarity", manufacturer: "Ripper", rarity: "Legendary", effect: "AF1000 Skin", internalName: "comp_05_legendary_augmenter" },

  // ═══════════════════════════════════════════════════════════════════
  // ORDER (285) — Model: Recorporator
  // Legendary 1: Heart Pump → Triple Bypass Skin
  // Legendary 2: Blood Moon → Paleblood Skin
  // ═══════════════════════════════════════════════════════════════════
  { code: "{285:1}", partName: "Heart Pump", itemType: "Heart Pump", category: "Repkit", partType: "Legendary Perk", manufacturer: "Order", rarity: "Legendary", effect: "This Repkit has 3 Charges, and a 30% chance to refill 1 Charge on enemy kill", internalName: "part_augment_unique_triplebypass" },
  { code: "{285:2}", partName: "Recorporator", itemType: "Recorporator", category: "Repkit", partType: "Model", manufacturer: "Order", effect: "2082/2082 Heal, 8s/24s Cooldown", internalName: "part_ord" },
  { code: "{285:3}", partName: "Common", itemType: "Common", category: "Repkit", partType: "Rarity", manufacturer: "Order", rarity: "Common", internalName: "comp_01_common" },
  { code: "{285:4}", partName: "Uncommon", itemType: "Uncommon", category: "Repkit", partType: "Rarity", manufacturer: "Order", rarity: "Uncommon", internalName: "comp_02_uncommon" },
  { code: "{285:5}", partName: "Rare", itemType: "Rare", category: "Repkit", partType: "Rarity", manufacturer: "Order", rarity: "Rare", internalName: "comp_03_rare" },
  { code: "{285:6}", partName: "Epic", itemType: "Epic", category: "Repkit", partType: "Rarity", manufacturer: "Order", rarity: "Epic", internalName: "comp_04_epic" },
  { code: "{285:7}", partName: "Triple Bypass", itemType: "Triple Bypass", category: "Repkit", partType: "Rarity", manufacturer: "Order", rarity: "Legendary", effect: "Triple Bypass Skin", internalName: "comp_05_legendary_triplebypass" },
  { code: "{285:8}", partName: "Blood Moon", itemType: "Blood Moon", category: "Repkit", partType: "Legendary Perk", manufacturer: "Order", rarity: "Legendary", effect: "Broken Vial: Heals for recent instances of Damage taken within a time window. Red Text: Fighting evil by moonlight.", internalName: "part_augment_unique_paleblood" },
  { code: "{285:9}", partName: "Paleblood", itemType: "Paleblood", category: "Repkit", partType: "Rarity", manufacturer: "Order", rarity: "Legendary", effect: "Blood Moon Skin", internalName: "comp_05_legendary_paleblood" },

  // ═══════════════════════════════════════════════════════════════════
  // TEDIORE (290) — Model: Pocket Doc
  // Legendary: Blood Siphon → Kill Spring Skin
  // ═══════════════════════════════════════════════════════════════════
  { code: "{290:1}", partName: "Blood Siphon", itemType: "Blood Siphon", category: "Repkit", partType: "Legendary Perk", manufacturer: "Tediore", rarity: "Legendary", effect: "On kill, converts 100% of overkill damage into a healing orb that seeks nearby allies", internalName: "part_augment_unique_killspring" },
  { code: "{290:2}", partName: "Pocket Doc", itemType: "Pocket Doc", category: "Repkit", partType: "Model", manufacturer: "Tediore", effect: "2974 Heal, 8s/16s Cooldown", internalName: "part_ted" },
  { code: "{290:3}", partName: "Common", itemType: "Common", category: "Repkit", partType: "Rarity", manufacturer: "Tediore", rarity: "Common", internalName: "comp_01_common" },
  { code: "{290:4}", partName: "Uncommon", itemType: "Uncommon", category: "Repkit", partType: "Rarity", manufacturer: "Tediore", rarity: "Uncommon", internalName: "comp_02_uncommon" },
  { code: "{290:5}", partName: "Rare", itemType: "Rare", category: "Repkit", partType: "Rarity", manufacturer: "Tediore", rarity: "Rare", internalName: "comp_03_rare" },
  { code: "{290:6}", partName: "Epic", itemType: "Epic", category: "Repkit", partType: "Rarity", manufacturer: "Tediore", rarity: "Epic", internalName: "comp_04_epic" },
  { code: "{290:7}", partName: "Kill Spring", itemType: "Kill Spring", category: "Repkit", partType: "Rarity", manufacturer: "Tediore", rarity: "Legendary", effect: "Kill Spring Skin", internalName: "comp_05_legendary_killspring" },

  // ═══════════════════════════════════════════════════════════════════
  // TORGUE (261) — Model: Juicer
  // Legendary: Chrome → War Paint Skin
  // ═══════════════════════════════════════════════════════════════════
  { code: "{261:1}", partName: "Common", itemType: "Common", category: "Repkit", partType: "Rarity", manufacturer: "Torgue", rarity: "Common", internalName: "comp_01_common" },
  { code: "{261:2}", partName: "Uncommon", itemType: "Uncommon", category: "Repkit", partType: "Rarity", manufacturer: "Torgue", rarity: "Uncommon", internalName: "comp_02_uncommon" },
  { code: "{261:3}", partName: "Rare", itemType: "Rare", category: "Repkit", partType: "Rarity", manufacturer: "Torgue", rarity: "Rare", internalName: "comp_03_rare" },
  { code: "{261:4}", partName: "Epic", itemType: "Epic", category: "Repkit", partType: "Rarity", manufacturer: "Torgue", rarity: "Epic", internalName: "comp_04_epic" },
  { code: "{261:5}", partName: "War Paint", itemType: "War Paint", category: "Repkit", partType: "Rarity", manufacturer: "Torgue", rarity: "Legendary", effect: "War Paint Skin", internalName: "comp_05_legendary_shinywarpaint" },
  { code: "{261:6}", partName: "Chrome", itemType: "Chrome", category: "Repkit", partType: "Legendary Perk", manufacturer: "Torgue", rarity: "Legendary", effect: "On use, grants +30% Fire Rate and +30% Movement Speed for Repkit Base Duration, and reduces Repkit Cooldown by 2s each time Damage is taken", internalName: "part_augment_unique_shinywarpaint" },
  { code: "{261:7}", partName: "Juicer", itemType: "Juicer", category: "Repkit", partType: "Model", manufacturer: "Torgue", effect: "1190/1190 Heal, 6s/16s Cooldown", internalName: "part_tor" },
];

for (const entry of newEntries) {
  final.push(entry);
}

db.rows = final;
fs.writeFileSync(dbPath, JSON.stringify(db));
console.log(`Added ${newEntries.length} corrected repkit manufacturer entries`);
console.log(`Total rows now: ${final.length}`);

// Verify
const verify = JSON.parse(fs.readFileSync(dbPath, "utf8")).rows;
const repkits = verify.filter(r => r.category === "Repkit");
console.log(`\nVerification — total repkit entries: ${repkits.length}`);
const legendaries = repkits.filter(r => r.rarity === "Legendary");
console.log(`Legendary entries: ${legendaries.length}`);
legendaries.forEach(r => console.log(`  ${r.code} ${r.partType.padEnd(15)} ${r.partName.padEnd(22)} [${r.manufacturer}] ${(r.effect || "").substring(0, 50)}`));
