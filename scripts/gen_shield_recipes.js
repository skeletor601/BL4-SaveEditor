#!/usr/bin/env node
/**
 * Generate 80 type-aware shield recipes:
 * - 30 Armor varieties
 * - 30 Energy varieties
 * - 10 Bininu (Armor) variants — health-focused
 * - 10 Vintage (Armor) variants — no armor segments
 *
 * Rules:
 * - Armor shields: only Armor legendaries + {237} armor perks, NO {248}
 * - Energy shields: only Energy legendaries + {248} energy perks, NO {237}
 * - Universal {246} on everything, separate blocks per perk ID
 * - Bininu: extra Healthy(50) + Divider(30) stacking
 * - Vintage: no armor segments at all
 */

const fs = require("fs");
const path = require("path");

const rep = (id, n) => Array(n).fill(id).join(" ");
const block = (type, ids) => Array.isArray(ids) ? `{${type}:[${ids.join(" ")}]}` : `{${type}:${ids}}`;
const legStack = (mfg, perkId, count) => block(mfg, Array(count).fill(perkId));

// Separate universal blocks per ID
const universalBlocks = (idCounts) => {
  const tokens = [];
  for (const [id, count] of Object.entries(idCounts)) {
    if (count <= 1) tokens.push(`{246:${id}}`);
    else tokens.push(block(246, Array(count).fill(Number(id))));
  }
  return tokens.join(" ");
};

// Separate armor blocks per ID
const armorBlocks = (idCounts) => {
  const tokens = [];
  for (const [id, count] of Object.entries(idCounts)) {
    if (count <= 1) tokens.push(`{237:${id}}`);
    else tokens.push(block(237, Array(count).fill(Number(id))));
  }
  return tokens.join(" ");
};

// Separate energy blocks per ID
const energyBlocks = (idCounts) => {
  const tokens = [];
  for (const [id, count] of Object.entries(idCounts)) {
    if (count <= 1) tokens.push(`{248:${id}}`);
    else tokens.push(block(248, Array(count).fill(Number(id))));
  }
  return tokens.join(" ");
};

// ═══════════════════════════════════════
// ARMOR LEGENDARIES (from Armor mfgs)
// Vladof(283): 6=Refreshments, 8=Bareknuckle, 11=Exoskeleton
// Tediore(287): 6=Shield Boi, 9=Bininu
// Jakobs(306): 7=Vintage, 8=Shallot Shell
// Torgue(321): 6=Bundled, 9=Sisyphusian
//
// ENERGY LEGENDARIES (from Energy mfgs)
// Maliwan(279): 1=Nucleosynthesis, 8=Psychosis
// Order(293): 1=Glass, 2=Direct Current
// Ripper(300): 6=Short Circuit, 8=Overshield Eater, 11=Backdoor
// Daedalus(312): 6=Wings of Grace, 8=Power Play
// ═══════════════════════════════════════

const CORE_UNIVERSAL = { 30: 120, 50: 120, 54: 120 }; // Divider, Healthy, Capacity — always on every shield
const CORE_UNIVERSAL_LIGHT = { 30: 60, 50: 60, 54: 60 };
const CORE_UNIVERSAL_HEAVY = { 30: 200, 50: 200, 54: 200 };
const BININU_CORE = { 30: 200, 50: 250, 54: 120 }; // Bininu: extra Healthy + Divider

const AMMO_REGEN_21 = block(22, Array(21).fill(68));
const AMMO_REGEN_15 = block(22, Array(15).fill(68));
const MOVE_SPEED = ["{234:42}", "{234:62}"];

// ═══════════════════════════════════════
// 30 ARMOR RECIPES
// ═══════════════════════════════════════
const armorRecipes = [
  {
    id: "armor-iron-wall",
    label: "Iron Wall",
    notes: "Armor: Exoskeleton + Shield Boi + Shallot Shell. Heavy armor stacking.",
    legendaries: [legStack(283, 11, 15), legStack(287, 6, 15), legStack(306, 8, 15)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 15, 56: 15, 57: 15, 58: 15 }),
    defense: armorBlocks({ 8: 20, 9: 20, 20: 15, 21: 15, 31: 15 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "armor-fortress",
    label: "Fortress",
    notes: "Armor: Vladof triple — Refreshments + Bareknuckle + Exoskeleton + Sisyphusian.",
    legendaries: [legStack(283, 6, 12), legStack(283, 8, 12), legStack(283, 11, 12), legStack(321, 9, 15)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 57: 12, 58: 12 }),
    defense: armorBlocks({ 8: 18, 9: 18, 20: 12, 21: 12, 4: 8, 5: 8 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "armor-diamond-skin",
    label: "Diamond Skin",
    notes: "Armor: Exoskeleton + Bundled + Shield Boi. Massive armor + health stacking.",
    legendaries: [legStack(283, 11, 18), legStack(321, 6, 12), legStack(287, 6, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 15, 57: 15 }),
    defense: armorBlocks({ 1: 12, 2: 12, 3: 12, 8: 18, 9: 18, 22: 8, 23: 8 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "armor-bulwark",
    label: "Bulwark",
    notes: "Armor: Shallot Shell x25 + Shield Boi x25. Double manufacturer defense wall.",
    legendaries: [legStack(306, 8, 25), legStack(287, 6, 25)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 18, 56: 12 }),
    defense: armorBlocks({ 8: 25, 9: 25, 31: 20, 20: 12, 21: 12 }),
    extras: []
  },
  {
    id: "armor-adamantine",
    label: "Adamantine",
    notes: "Armor: All 4 Armor manufacturers represented. Pure survivability.",
    legendaries: [legStack(283, 11, 12), legStack(287, 6, 12), legStack(306, 8, 12), legStack(321, 9, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 12, 56: 10, 58: 10, 35: 8, 36: 8 }),
    defense: armorBlocks({ 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 8: 12, 9: 12, 20: 8, 21: 8 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "armor-vladof-supremacy",
    label: "Vladof Supremacy",
    notes: "Armor: All 3 Vladof legendaries maxed. Pure Vladof power.",
    legendaries: [legStack(283, 6, 20), legStack(283, 8, 20), legStack(283, 11, 20)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 12, 57: 12 }),
    defense: armorBlocks({ 8: 18, 9: 18, 20: 12, 21: 12 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "armor-torgue-party",
    label: "Torgue Party",
    notes: "Armor: Bundled x50 + Sisyphusian x20. Massive explosion stacking.",
    legendaries: [legStack(321, 6, 50), legStack(321, 9, 20)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 15, 36: 15, 27: 12, 28: 12 }),
    defense: armorBlocks({ 8: 12, 9: 12 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "armor-jakobs-heritage",
    label: "Jakobs Heritage",
    notes: "Armor: Shallot Shell x25. Old-school reliability with massive defense.",
    legendaries: [legStack(306, 8, 25), legStack(283, 6, 15)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 56: 15, 55: 12 }),
    defense: armorBlocks({ 8: 18, 9: 18, 20: 12, 21: 12, 31: 12, 22: 8, 23: 8 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "armor-tediore-recycler",
    label: "Tediore Recycler",
    notes: "Armor: Shield Boi x20 + Refreshments x15. Shield recycle + sustain.",
    legendaries: [legStack(287, 6, 20), legStack(283, 6, 15)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 12, 57: 8 }),
    defense: armorBlocks({ 8: 15, 9: 15, 4: 8, 5: 8 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "armor-juggernaut",
    label: "Juggernaut",
    notes: "Armor: Refreshments + Sisyphusian. Tanky with sustain.",
    legendaries: [legStack(283, 6, 18), legStack(321, 9, 15), legStack(306, 8, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 12, 58: 8 }),
    defense: armorBlocks({ 8: 18, 9: 18, 31: 12, 2: 8, 3: 8 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "armor-berserker",
    label: "Berserker",
    notes: "Armor: Bareknuckle x25 + Bundled x20. Melee damage output.",
    legendaries: [legStack(283, 8, 25), legStack(321, 6, 20)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 27: 12, 28: 12, 35: 15, 36: 15 }),
    defense: armorBlocks({ 4: 10, 5: 10, 8: 12, 9: 12 }),
    extras: [...MOVE_SPEED]
  },
  {
    id: "armor-grand-finale",
    label: "Grand Finale",
    notes: "Armor: Bundled x40 + Sisyphusian x15 + Shallot Shell x10. Explosive fireworks on kill.",
    legendaries: [legStack(321, 6, 40), legStack(321, 9, 15), legStack(306, 8, 10)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 15, 36: 15, 27: 10, 28: 10 }),
    defense: armorBlocks({ 8: 12, 9: 12 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "armor-sentinel",
    label: "Sentinel",
    notes: "Armor: Shallot Shell x18 + Exoskeleton x15 + Shield Boi x12.",
    legendaries: [legStack(306, 8, 18), legStack(283, 11, 15), legStack(287, 6, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 56: 12, 55: 10 }),
    defense: armorBlocks({ 8: 15, 9: 15, 20: 12, 21: 12, 31: 10 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "armor-vanguard",
    label: "Vanguard",
    notes: "Armor: Tediore duo + Vladof Exoskeleton. Shield Boi + Refreshments.",
    legendaries: [legStack(287, 6, 18), legStack(283, 11, 12), legStack(283, 6, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 12, 57: 8 }),
    defense: armorBlocks({ 8: 18, 9: 18, 20: 12, 21: 12, 4: 8, 5: 8 }),
    extras: [AMMO_REGEN_21]
  },
  {
    id: "armor-equilibrium",
    label: "Equilibrium",
    notes: "Armor: One per manufacturer. Balanced across all 4 Armor mfgs.",
    legendaries: [legStack(283, 6, 12), legStack(287, 6, 12), legStack(306, 8, 12), legStack(321, 6, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 8, 36: 8, 55: 8, 57: 8 }),
    defense: armorBlocks({ 8: 12, 9: 12, 20: 8, 21: 8 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "armor-templar",
    label: "Templar",
    notes: "Armor: Shallot Shell + Shield Boi + Sisyphusian. Classic tank.",
    legendaries: [legStack(306, 8, 15), legStack(287, 6, 15), legStack(321, 9, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 56: 10, 55: 10 }),
    defense: armorBlocks({ 8: 15, 9: 15, 31: 10, 20: 10, 21: 10 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "armor-marathon",
    label: "Marathon",
    notes: "Armor: Shield Boi + Refreshments. Class mod perks + ammo regen.",
    legendaries: [legStack(287, 6, 18), legStack(283, 6, 18)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 8 }),
    defense: armorBlocks({ 4: 8, 5: 8, 8: 10 }),
    extras: [block(22, Array(30).fill(68)), ...MOVE_SPEED, block(234, [...Array(25).fill(41), ...Array(15).fill(61)])]
  },
  {
    id: "armor-supply-line",
    label: "Supply Line",
    notes: "Armor: Maximum ammo regen + Refreshments + Shield Boi. Pure utility.",
    legendaries: [legStack(283, 6, 20), legStack(287, 6, 20)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 12 }),
    defense: armorBlocks({ 8: 10, 9: 10, 4: 8, 5: 8 }),
    extras: [block(22, Array(35).fill(68)), ...MOVE_SPEED]
  },
  {
    id: "armor-wrecking-ball",
    label: "Wrecking Ball",
    notes: "Armor: Bundled x35 + Bareknuckle x20. Explosive + melee.",
    legendaries: [legStack(321, 6, 35), legStack(283, 8, 20)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 15, 36: 15, 27: 15, 28: 15 }),
    defense: armorBlocks({ 8: 10, 9: 10 }),
    extras: [...MOVE_SPEED]
  },
  {
    id: "armor-divider-max",
    label: "Divider Max",
    notes: "Armor: Exoskeleton + Sisyphusian. Extreme Divider + Capacity stacking.",
    legendaries: [legStack(283, 11, 18), legStack(321, 9, 18)],
    universal: universalBlocks({ ...CORE_UNIVERSAL_HEAVY, 55: 20, 56: 15 }),
    defense: armorBlocks({ 8: 18, 9: 18, 31: 15 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "armor-class-master",
    label: "Class Master",
    notes: "Armor: Refreshments + Bundled. Shield as stat stick with class mod perks.",
    legendaries: [legStack(283, 6, 12), legStack(321, 6, 18)],
    universal: universalBlocks({ ...CORE_UNIVERSAL }),
    defense: armorBlocks({ 8: 8, 9: 8 }),
    extras: [block(234, [...Array(40).fill(41), ...Array(30).fill(61), ...Array(20).fill(59), ...Array(15).fill(3), ...Array(10).fill(57), 42, 62]), AMMO_REGEN_21]
  },
  {
    id: "armor-turtle-mode",
    label: "Turtle Mode",
    notes: "Armor: Shield Boi + Shallot Shell + Exoskeleton. Max delay reduction + capacity.",
    legendaries: [legStack(287, 6, 20), legStack(306, 8, 20), legStack(283, 11, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL_HEAVY, 56: 15 }),
    defense: armorBlocks({ 20: 20, 21: 20, 8: 12, 9: 12, 31: 10 }),
    extras: []
  },
  {
    id: "armor-quicksilver",
    label: "Quicksilver",
    notes: "Armor: Shield Boi + Refreshments. Max movement + ammo regen.",
    legendaries: [legStack(287, 6, 20), legStack(283, 6, 15)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 12, 56: 8 }),
    defense: armorBlocks({ 4: 8, 5: 8 }),
    extras: [block(22, Array(30).fill(68)), ...MOVE_SPEED, block(234, [...Array(15).fill(41), ...Array(10).fill(3)])]
  },
  {
    id: "armor-exo-tank",
    label: "Exo Tank",
    notes: "Armor: Exoskeleton x25 solo. Pure Vladof armor focus.",
    legendaries: [legStack(283, 11, 25)],
    universal: universalBlocks({ ...CORE_UNIVERSAL_HEAVY }),
    defense: armorBlocks({ 8: 25, 9: 25, 20: 20, 21: 20, 31: 20 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "armor-bare-fist",
    label: "Bare Fist",
    notes: "Armor: Bareknuckle x30 + Shield Boi x15. Melee build shield.",
    legendaries: [legStack(283, 8, 30), legStack(287, 6, 15)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 27: 18, 28: 18, 35: 12, 36: 12 }),
    defense: armorBlocks({ 4: 10, 5: 10, 8: 10 }),
    extras: [...MOVE_SPEED]
  },
  {
    id: "armor-stone-wall",
    label: "Stone Wall",
    notes: "Armor: Shallot Shell x20 + Sisyphusian x20 + Exoskeleton x10. Triple defense.",
    legendaries: [legStack(306, 8, 20), legStack(321, 9, 20), legStack(283, 11, 10)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 15, 56: 15 }),
    defense: armorBlocks({ 8: 20, 9: 20, 20: 15, 21: 15, 31: 12 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "armor-refreshment-stand",
    label: "Refreshment Stand",
    notes: "Armor: Refreshments x30. Pure sustain from Vladof.",
    legendaries: [legStack(283, 6, 30), legStack(321, 6, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 15, 57: 10 }),
    defense: armorBlocks({ 8: 15, 9: 15, 1: 10, 2: 10 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "armor-torgue-vladof",
    label: "Torgue-Vladof Hybrid",
    notes: "Armor: Bundled + Exoskeleton + Bareknuckle. Explosive + armor + melee.",
    legendaries: [legStack(321, 6, 20), legStack(283, 11, 15), legStack(283, 8, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 12, 36: 12, 27: 10, 28: 10 }),
    defense: armorBlocks({ 8: 15, 9: 15, 4: 10, 5: 10 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "armor-shield-boi-max",
    label: "Shield Boi Max",
    notes: "Armor: Shield Boi x30. Maximum Tediore shield stacking.",
    legendaries: [legStack(287, 6, 30), legStack(306, 8, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL_HEAVY, 55: 15 }),
    defense: armorBlocks({ 8: 20, 9: 20, 20: 15, 21: 15 }),
    extras: [AMMO_REGEN_21]
  },
  {
    id: "armor-all-star",
    label: "All-Star Armor",
    notes: "Armor: 4 mfg legendaries x15 each. Every Armor manufacturer represented.",
    legendaries: [legStack(283, 6, 15), legStack(287, 6, 15), legStack(306, 8, 15), legStack(321, 6, 15)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 10, 56: 10, 57: 10, 58: 10, 35: 8, 36: 8 }),
    defense: armorBlocks({ 8: 12, 9: 12, 20: 10, 21: 10, 31: 8 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
];

// ═══════════════════════════════════════
// 30 ENERGY RECIPES
// ═══════════════════════════════════════
const energyRecipes = [
  {
    id: "energy-power-surge",
    label: "Power Surge",
    notes: "Energy: Power Play x20 + Direct Current x20. Massive energy damage.",
    legendaries: [legStack(312, 8, 20), legStack(293, 2, 20)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 20, 36: 20, 27: 12, 28: 12 }),
    defense: energyBlocks({ 1: 12, 2: 12, 4: 12, 5: 12, 8: 8 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "energy-glass-cannon",
    label: "Glass Cannon",
    notes: "Energy: Glass x25 + Wings of Grace x18. Maximum damage, minimal defense.",
    legendaries: [legStack(293, 1, 25), legStack(312, 6, 18), legStack(312, 8, 8)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 20, 36: 20, 37: 15, 38: 15, 27: 8, 28: 8 }),
    defense: energyBlocks({ 1: 8, 4: 8, 5: 8, 8: 8 }),
    extras: [...MOVE_SPEED]
  },
  {
    id: "energy-nuclear-meltdown",
    label: "Nuclear Meltdown",
    notes: "Energy: Nucleosynthesis x25 + Psychosis x15 + Short Circuit x15. Radiation + shock.",
    legendaries: [legStack(279, 1, 25), legStack(279, 8, 15), legStack(300, 6, 15)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 15, 36: 15 }),
    defense: energyBlocks({ 4: 12, 5: 12, 6: 8 }),
    extras: [AMMO_REGEN_21]
  },
  {
    id: "energy-backdoor-breach",
    label: "Backdoor Breach",
    notes: "Energy: Ripper triple — Short Circuit + Overshield Eater + Backdoor.",
    legendaries: [legStack(300, 6, 15), legStack(300, 8, 15), legStack(300, 11, 15)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 27: 12, 28: 12, 35: 12, 36: 12 }),
    defense: energyBlocks({ 1: 8, 4: 8, 8: 8 }),
    extras: [...MOVE_SPEED]
  },
  {
    id: "energy-order-chaos",
    label: "Order & Chaos",
    notes: "Energy: Glass x25 + Direct Current x25. Full Order legendary suite.",
    legendaries: [legStack(293, 1, 25), legStack(293, 2, 25)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 15, 36: 15, 56: 12 }),
    defense: energyBlocks({ 1: 10, 2: 10, 4: 10 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "energy-daedalus-wings",
    label: "Daedalus Wings",
    notes: "Energy: Wings of Grace x25 + Power Play x25. Full Daedalus.",
    legendaries: [legStack(312, 6, 25), legStack(312, 8, 25)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 12, 36: 12, 55: 8, 56: 8 }),
    defense: energyBlocks({ 1: 10, 2: 10, 4: 10, 5: 10 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "energy-maliwan-fusion",
    label: "Maliwan Fusion",
    notes: "Energy: Nucleosynthesis x25 + Psychosis x20. Elemental shield effects.",
    legendaries: [legStack(279, 1, 25), legStack(279, 8, 20)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 20, 36: 20 }),
    defense: energyBlocks({ 1: 12, 2: 12, 3: 12, 4: 12, 5: 8 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "energy-ripper-assault",
    label: "Ripper Assault",
    notes: "Energy: All 3 Ripper legendaries. Full breach kit.",
    legendaries: [legStack(300, 6, 15), legStack(300, 8, 20), legStack(300, 11, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 27: 15, 28: 15, 35: 12, 36: 12 }),
    defense: energyBlocks({ 4: 10, 5: 10, 6: 10 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "energy-psycho-ward",
    label: "Psycho Ward",
    notes: "Energy: Psychosis x25 + Overshield Eater x18. Low shield = max damage.",
    legendaries: [legStack(279, 8, 25), legStack(300, 8, 18)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 27: 15, 28: 15, 35: 12, 36: 12 }),
    defense: energyBlocks({ 4: 8, 5: 8, 6: 8 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "energy-overload",
    label: "Energy Overload",
    notes: "Energy: Short Circuit + Power Play. Maximum energy perk stacking.",
    legendaries: [legStack(300, 6, 20), legStack(312, 8, 20)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 12, 36: 12 }),
    defense: energyBlocks({ 1: 15, 2: 15, 3: 15, 4: 15, 5: 12, 6: 10, 7: 10, 8: 10 }),
    extras: [...MOVE_SPEED]
  },
  {
    id: "energy-harmony",
    label: "Harmony",
    notes: "Energy: Nucleosynthesis + Wings of Grace + Glass. Regen + flight + shield.",
    legendaries: [legStack(279, 1, 15), legStack(312, 6, 15), legStack(293, 1, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 12, 56: 10, 57: 8 }),
    defense: energyBlocks({ 1: 8, 2: 8, 3: 8 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "energy-all-rounder",
    label: "All-Rounder Energy",
    notes: "Energy: All 4 Energy manufacturers represented. Jack of all trades.",
    legendaries: [legStack(279, 1, 10), legStack(293, 2, 10), legStack(300, 8, 10), legStack(312, 6, 10)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 8, 36: 8, 55: 8, 57: 8 }),
    defense: energyBlocks({ 1: 8, 2: 8, 4: 8 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "energy-vampiric",
    label: "Vampiric",
    notes: "Energy: Nucleosynthesis regen + Direct Current. Life steal shield.",
    legendaries: [legStack(279, 1, 22), legStack(293, 2, 15)],
    universal: universalBlocks({ ...CORE_UNIVERSAL_HEAVY, 55: 12, 56: 8 }),
    defense: energyBlocks({ 1: 8, 2: 8 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "energy-phantom",
    label: "Phantom",
    notes: "Energy: Nucleosynthesis + Wings of Grace. Regen + flight. Enhancement IDs.",
    legendaries: [legStack(279, 1, 20), legStack(312, 6, 20)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 15, 56: 12 }),
    defense: energyBlocks({ 1: 10, 2: 10, 3: 10 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED, block(247, [...Array(8).fill(81), ...Array(8).fill(169)])]
  },
  {
    id: "energy-legendary-flood",
    label: "Legendary Flood",
    notes: "Energy: 4 manufacturers, every legendary stacked x12. Max diversity.",
    legendaries: [legStack(279, 1, 12), legStack(293, 2, 12), legStack(300, 8, 12), legStack(312, 6, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL }),
    defense: energyBlocks({ 1: 6, 4: 6 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "energy-capacity-overflow",
    label: "Capacity Overflow",
    notes: "Energy: Wings of Grace + Glass. Shield capacity through the roof.",
    legendaries: [legStack(312, 6, 20), legStack(293, 1, 15)],
    universal: universalBlocks({ ...CORE_UNIVERSAL_HEAVY, 56: 15, 55: 12 }),
    defense: energyBlocks({ 1: 10, 2: 10, 8: 8 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "energy-shock-therapy",
    label: "Shock Therapy",
    notes: "Energy: Short Circuit x25 + Direct Current x20. Shock burst + shield break.",
    legendaries: [legStack(300, 6, 25), legStack(293, 2, 20)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 18, 36: 18 }),
    defense: energyBlocks({ 4: 12, 5: 12, 6: 10, 7: 10 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "energy-wings-of-power",
    label: "Wings of Power",
    notes: "Energy: Wings of Grace x30 + Overshield Eater x15. Flight + overshield.",
    legendaries: [legStack(312, 6, 30), legStack(300, 8, 15)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 15, 35: 10, 36: 10 }),
    defense: energyBlocks({ 1: 10, 2: 10, 4: 10 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "energy-backdoor-wings",
    label: "Backdoor Wings",
    notes: "Energy: Backdoor x20 + Wings of Grace x18. Ripper + Daedalus combo.",
    legendaries: [legStack(300, 11, 20), legStack(312, 6, 18)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 27: 12, 28: 12 }),
    defense: energyBlocks({ 1: 10, 4: 10, 8: 8 }),
    extras: [...MOVE_SPEED]
  },
  {
    id: "energy-nucleosynthesis-max",
    label: "Nucleosynthesis Max",
    notes: "Energy: Nucleosynthesis x30. Pure Maliwan regen.",
    legendaries: [legStack(279, 1, 30)],
    universal: universalBlocks({ ...CORE_UNIVERSAL_HEAVY, 55: 15 }),
    defense: energyBlocks({ 1: 15, 2: 15, 3: 10 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "energy-overshield-rush",
    label: "Overshield Rush",
    notes: "Energy: Overshield Eater x25 + Power Play x15. Overshield aggression.",
    legendaries: [legStack(300, 8, 25), legStack(312, 8, 15)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 27: 15, 28: 15, 35: 10, 36: 10 }),
    defense: energyBlocks({ 4: 12, 5: 12, 6: 8 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "energy-direct-power",
    label: "Direct Power",
    notes: "Energy: Direct Current x20 + Power Play x20. Order + Daedalus offense.",
    legendaries: [legStack(293, 2, 20), legStack(312, 8, 20)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 15, 36: 15, 27: 10, 28: 10 }),
    defense: energyBlocks({ 1: 10, 2: 10, 4: 10, 5: 10 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "energy-circuit-breaker",
    label: "Circuit Breaker",
    notes: "Energy: Short Circuit x20 + Backdoor x15 + Psychosis x10.",
    legendaries: [legStack(300, 6, 20), legStack(300, 11, 15), legStack(279, 8, 10)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 12, 36: 12, 27: 10, 28: 10 }),
    defense: energyBlocks({ 4: 10, 5: 10, 6: 8, 7: 8 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "energy-glass-wings",
    label: "Glass Wings",
    notes: "Energy: Glass x20 + Wings of Grace x20. Order + Daedalus synergy.",
    legendaries: [legStack(293, 1, 20), legStack(312, 6, 20)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 12, 56: 10, 35: 10, 36: 10 }),
    defense: energyBlocks({ 1: 10, 2: 10, 3: 10 }),
    extras: [AMMO_REGEN_21]
  },
  {
    id: "energy-tri-force",
    label: "Tri-Force",
    notes: "Energy: 3 mfg legendaries — Maliwan + Order + Daedalus.",
    legendaries: [legStack(279, 1, 15), legStack(293, 2, 15), legStack(312, 8, 15)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 10, 36: 10, 55: 10 }),
    defense: energyBlocks({ 1: 10, 2: 10, 4: 10 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "energy-supernova",
    label: "Supernova",
    notes: "Energy: Psychosis x20 + Short Circuit x20 + Glass x10. Elemental explosion.",
    legendaries: [legStack(279, 8, 20), legStack(300, 6, 20), legStack(293, 1, 10)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 18, 36: 18, 27: 12, 28: 12 }),
    defense: energyBlocks({ 4: 10, 5: 10, 6: 8 }),
    extras: [...MOVE_SPEED]
  },
  {
    id: "energy-quickcharge",
    label: "Quickcharge",
    notes: "Energy: Wings of Grace + Direct Current. Fast recharge + capacity.",
    legendaries: [legStack(312, 6, 20), legStack(293, 2, 18)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 56: 15, 55: 12 }),
    defense: energyBlocks({ 1: 12, 2: 12, 3: 12 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "energy-class-master",
    label: "Energy Class Master",
    notes: "Energy: Power Play + Glass. Shield as stat stick for class builds.",
    legendaries: [legStack(312, 8, 12), legStack(293, 1, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL }),
    defense: energyBlocks({ 1: 8, 4: 8 }),
    extras: [block(234, [...Array(40).fill(41), ...Array(30).fill(61), ...Array(20).fill(59), ...Array(15).fill(3), ...Array(10).fill(57), 42, 62]), AMMO_REGEN_21]
  },
  {
    id: "energy-power-play-max",
    label: "Power Play Max",
    notes: "Energy: Power Play x30. Maximum Daedalus power stacking.",
    legendaries: [legStack(312, 8, 30), legStack(300, 8, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 15, 36: 15 }),
    defense: energyBlocks({ 1: 12, 2: 12, 4: 12, 5: 12 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "energy-all-star",
    label: "All-Star Energy",
    notes: "Energy: 4 mfg legendaries x12 each. Every Energy manufacturer represented.",
    legendaries: [legStack(279, 1, 12), legStack(293, 2, 12), legStack(300, 6, 12), legStack(312, 6, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 8, 56: 8, 35: 8, 36: 8 }),
    defense: energyBlocks({ 1: 10, 2: 10, 4: 10, 5: 10, 8: 8 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
];

// ═══════════════════════════════════════
// 10 BININU VARIANTS (Armor, health-focused)
// ═══════════════════════════════════════
const bininuRecipes = [
  {
    id: "bininu-health-gate",
    label: "Bininu Health Gate",
    notes: "Bininu: Massive Healthy + Divider stacking. Pure health gate.",
    legendaries: [legStack(287, 9, 20), legStack(283, 11, 15)],
    universal: universalBlocks({ ...BININU_CORE, 55: 15, 56: 12 }),
    defense: armorBlocks({ 8: 15, 9: 15, 20: 12, 21: 12 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "bininu-immortal",
    label: "Bininu Immortal",
    notes: "Bininu: Extreme Healthy + Divider + Capacity. Near-immortality.",
    legendaries: [legStack(287, 9, 25), legStack(283, 6, 15)],
    universal: universalBlocks({ 30: 250, 50: 300, 54: 150, 55: 20, 56: 15 }),
    defense: armorBlocks({ 8: 20, 9: 20, 31: 15 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "bininu-tank",
    label: "Bininu Tank",
    notes: "Bininu + Shield Boi + Exoskeleton. Tediore + Vladof tank.",
    legendaries: [legStack(287, 9, 18), legStack(287, 6, 15), legStack(283, 11, 12)],
    universal: universalBlocks({ ...BININU_CORE, 55: 12 }),
    defense: armorBlocks({ 8: 18, 9: 18, 20: 12, 21: 12, 4: 8, 5: 8 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "bininu-regen",
    label: "Bininu Regen",
    notes: "Bininu + Refreshments. Health regen + sustain combo.",
    legendaries: [legStack(287, 9, 20), legStack(283, 6, 20)],
    universal: universalBlocks({ ...BININU_CORE, 55: 15, 57: 10 }),
    defense: armorBlocks({ 8: 12, 9: 12, 1: 10, 2: 10 }),
    extras: [AMMO_REGEN_21]
  },
  {
    id: "bininu-fortress",
    label: "Bininu Fortress",
    notes: "Bininu + Shallot Shell + Sisyphusian. Health gate + defense wall.",
    legendaries: [legStack(287, 9, 18), legStack(306, 8, 15), legStack(321, 9, 12)],
    universal: universalBlocks({ ...BININU_CORE, 56: 12, 55: 10 }),
    defense: armorBlocks({ 8: 18, 9: 18, 31: 15, 20: 10 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "bininu-balanced",
    label: "Bininu Balanced",
    notes: "Bininu + Bundled + Refreshments. Health + explosions + sustain.",
    legendaries: [legStack(287, 9, 15), legStack(321, 6, 15), legStack(283, 6, 12)],
    universal: universalBlocks({ ...BININU_CORE, 35: 10, 36: 10, 55: 8 }),
    defense: armorBlocks({ 8: 12, 9: 12, 4: 8, 5: 8 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "bininu-mega-health",
    label: "Bininu Mega Health",
    notes: "Bininu x30 solo. Maximum health perk stacking.",
    legendaries: [legStack(287, 9, 30)],
    universal: universalBlocks({ 30: 300, 50: 350, 54: 180, 55: 20 }),
    defense: armorBlocks({ 8: 20, 9: 20, 20: 15, 21: 15 }),
    extras: [AMMO_REGEN_21]
  },
  {
    id: "bininu-speed-heal",
    label: "Bininu Speed Heal",
    notes: "Bininu + Shield Boi. Health focus + movement speed.",
    legendaries: [legStack(287, 9, 20), legStack(287, 6, 18)],
    universal: universalBlocks({ ...BININU_CORE, 55: 12, 56: 8 }),
    defense: armorBlocks({ 4: 8, 5: 8 }),
    extras: [block(22, Array(30).fill(68)), ...MOVE_SPEED]
  },
  {
    id: "bininu-vladof-duo",
    label: "Bininu-Vladof Duo",
    notes: "Bininu + all 3 Vladof legendaries. Health + full Vladof suite.",
    legendaries: [legStack(287, 9, 15), legStack(283, 6, 12), legStack(283, 8, 10), legStack(283, 11, 10)],
    universal: universalBlocks({ ...BININU_CORE, 55: 10, 57: 8 }),
    defense: armorBlocks({ 8: 15, 9: 15, 20: 10, 21: 10 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "bininu-all-armor",
    label: "Bininu All-Armor",
    notes: "Bininu + one from each Armor mfg. Health gate + full coverage.",
    legendaries: [legStack(287, 9, 15), legStack(283, 6, 12), legStack(306, 8, 10), legStack(321, 6, 10)],
    universal: universalBlocks({ ...BININU_CORE, 55: 10, 56: 8, 58: 8 }),
    defense: armorBlocks({ 8: 12, 9: 12, 20: 10, 21: 10, 31: 8 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
];

// ═══════════════════════════════════════
// 10 VINTAGE VARIANTS (Armor, NO armor segments)
// ═══════════════════════════════════════
const vintageRecipes = [
  {
    id: "vintage-pure",
    label: "Vintage Pure",
    notes: "Vintage: No armor segments. Pure legendary + universal stacking.",
    legendaries: [legStack(306, 7, 25), legStack(283, 6, 15)],
    universal: universalBlocks({ ...CORE_UNIVERSAL_HEAVY, 55: 20, 56: 15, 57: 15 }),
    defense: "", // NO armor segments
    extras: [AMMO_REGEN_15]
  },
  {
    id: "vintage-shallot",
    label: "Vintage + Shallot",
    notes: "Vintage + Shallot Shell. Full Jakobs duo, no armor.",
    legendaries: [legStack(306, 7, 20), legStack(306, 8, 20)],
    universal: universalBlocks({ ...CORE_UNIVERSAL_HEAVY, 56: 18, 55: 15 }),
    defense: "",
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "vintage-bundled",
    label: "Vintage Bundled",
    notes: "Vintage + Bundled. Jakobs + Torgue, universals only for defense.",
    legendaries: [legStack(306, 7, 18), legStack(321, 6, 20)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 35: 15, 36: 15, 27: 12, 28: 12, 55: 10 }),
    defense: "",
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "vintage-exoskeleton",
    label: "Vintage Exoskeleton",
    notes: "Vintage + Exoskeleton. Jakobs delay + Vladof armor (from legendary), no extra armor segments.",
    legendaries: [legStack(306, 7, 20), legStack(283, 11, 18)],
    universal: universalBlocks({ ...CORE_UNIVERSAL_HEAVY, 55: 18, 56: 12 }),
    defense: "",
    extras: [AMMO_REGEN_21]
  },
  {
    id: "vintage-sisyphusian",
    label: "Vintage Sisyphusian",
    notes: "Vintage + Sisyphusian. Jakobs + Torgue, tanky universals.",
    legendaries: [legStack(306, 7, 20), legStack(321, 9, 18)],
    universal: universalBlocks({ ...CORE_UNIVERSAL_HEAVY, 55: 15, 58: 12 }),
    defense: "",
    extras: [AMMO_REGEN_15]
  },
  {
    id: "vintage-shield-boi",
    label: "Vintage Shield Boi",
    notes: "Vintage + Shield Boi. Jakobs + Tediore, universal defense focus.",
    legendaries: [legStack(306, 7, 18), legStack(287, 6, 18)],
    universal: universalBlocks({ ...CORE_UNIVERSAL_HEAVY, 55: 15, 56: 12, 57: 10 }),
    defense: "",
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "vintage-refreshments",
    label: "Vintage Refreshments",
    notes: "Vintage + Refreshments. Jakobs + Vladof sustain, no armor.",
    legendaries: [legStack(306, 7, 18), legStack(283, 6, 18)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 55: 15, 57: 12 }),
    defense: "",
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "vintage-bareknuckle",
    label: "Vintage Bareknuckle",
    notes: "Vintage + Bareknuckle. Offense + defense delay, universals only.",
    legendaries: [legStack(306, 7, 18), legStack(283, 8, 20)],
    universal: universalBlocks({ ...CORE_UNIVERSAL, 27: 15, 28: 15, 35: 12, 36: 12, 55: 10 }),
    defense: "",
    extras: [...MOVE_SPEED]
  },
  {
    id: "vintage-triple",
    label: "Vintage Triple",
    notes: "Vintage + Shallot Shell + Refreshments. 3 mfg, no armor segments.",
    legendaries: [legStack(306, 7, 15), legStack(306, 8, 15), legStack(283, 6, 12)],
    universal: universalBlocks({ ...CORE_UNIVERSAL_HEAVY, 55: 15, 56: 12, 57: 10 }),
    defense: "",
    extras: [AMMO_REGEN_15]
  },
  {
    id: "vintage-all-armor-mfg",
    label: "Vintage All-Armor",
    notes: "Vintage + one per Armor mfg. Full coverage, no armor segments.",
    legendaries: [legStack(306, 7, 12), legStack(283, 6, 12), legStack(287, 6, 10), legStack(321, 6, 10)],
    universal: universalBlocks({ ...CORE_UNIVERSAL_HEAVY, 55: 12, 56: 10, 57: 10, 58: 8 }),
    defense: "",
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
];

// Combine and format
const allRecipes = [...armorRecipes, ...energyRecipes, ...bininuRecipes, ...vintageRecipes].map(r => ({
  id: r.id,
  label: r.label,
  type: r.id.startsWith("energy") ? "Energy" : "Armor",
  notes: r.notes,
  legendaries: r.legendaries,
  universal: r.universal,
  defense: r.defense,
  extras: r.extras,
}));

const outPath = path.join(__dirname, "..", "web", "public", "data", "shield_recipes.json");
fs.writeFileSync(outPath, JSON.stringify(allRecipes, null, 2));
console.log(`Wrote ${allRecipes.length} shield recipes to ${outPath}`);
console.log(`  Armor: ${armorRecipes.length}`);
console.log(`  Energy: ${energyRecipes.length}`);
console.log(`  Bininu: ${bininuRecipes.length}`);
console.log(`  Vintage: ${vintageRecipes.length}`);
