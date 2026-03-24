#!/usr/bin/env node
/**
 * Generate 35+ shield recipe variations for shield_recipes.json
 * Based on Terra's 3 hand-crafted recipes + mix-and-match patterns
 */

const fs = require("fs");
const path = require("path");

// Helper: repeat a value N times as a space-separated string
const rep = (id, n) => Array(n).fill(id).join(" ");

// Helper: build a {type:[...]} token
const block = (type, ids) => {
  if (Array.isArray(ids)) {
    return `{${type}:[${ids.join(" ")}]}`;
  }
  return `{${type}:${ids}}`;
};

// Helper: build stacked legendary token
const legStack = (mfg, perkId, count) => block(mfg, Array(count).fill(perkId));

// Helper: build universal block from id->count map
const universalBlock = (idCounts) => {
  const ids = [];
  for (const [id, count] of Object.entries(idCounts)) {
    for (let i = 0; i < count; i++) ids.push(Number(id));
  }
  return ids.length > 0 ? block(246, ids) : "";
};

// Helper: build armor block from id->count map
const armorBlock = (idCounts) => {
  const ids = [];
  for (const [id, count] of Object.entries(idCounts)) {
    for (let i = 0; i < count; i++) ids.push(Number(id));
  }
  return ids.length > 0 ? block(237, ids) : "";
};

// Helper: build energy block from id->count map
const energyBlock = (idCounts) => {
  const ids = [];
  for (const [id, count] of Object.entries(idCounts)) {
    for (let i = 0; i < count; i++) ids.push(Number(id));
  }
  return ids.length > 0 ? block(248, ids) : "";
};

// Common extras
const AMMO_REGEN_21 = block(22, Array(21).fill(68));
const AMMO_REGEN_15 = block(22, Array(15).fill(68));
const AMMO_REGEN_39 = block(22, Array(39).fill(68));
const MOVE_SPEED = ["{234:42}", "{234:62}"];

// Keep Terra's 3 originals
const terraRecipes = [
  {
    id: "terra-tank",
    label: "Terra Tank",
    notes: "Terra's first shield. Heavy legendary stacking + massive Divider/Capacity for immortality. Armor perks for defense.",
    legendaries: ["{283:[6 6 6 6]}", "{283:[8 8 8 8 8]}", "{283:[11 11 11 11 11]}", "{287:[6 6]}", "{306:[8 8 8 8 8]}", "{321:[6 6 6 6 6]}", "{321:9}"],
    universal: "{246:[22 22 22 22 22 22 22 22 22 22 22 22 22 22 22 22 22 22 22 22 23 23 23 23 23 23 23 23 23 23 24 24 24 24 24 24 24 24 24 24 25 25 25 25 25 25 25 25 25 25 26 26 26 26 26 26 26 26 26 26 27 27 27 28 28 28 35 35 35 35 35 36 36 36 36 36 37 37 37 37 37 38 38 38 38 38 39 40 33 34 41 42 43 44 45 46 57 57 57 57 57 57 57 57 57 57 57 57 57 57 57 57 57 57 57 57 57 57 57 57 57 58 58 58 58 58 58 58 58 58 58 58 58 58 58 58 58 58 58 58 58 58 58 58 58 58 55 55 55 55 55 55 55 55 55 55 55 55 55 55 55 55 55 55 55 55 55 55 55 55 55 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 54 56 56 56 56 56 56 56 56 56 56 56 56 56 56 56 56 56 56 56 56 56 56 56 56 56 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50 50]}",
    armor: "{237:[20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 21 21 21 21 21 21 21 21 21 21 21 21 21 21 21 21 21 21 21 21 4 4 4 4 4 4 4 4 4 4 5 5 5 5 5 5 5 5 5 5 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 31 31 31 31 31 31 31 31 31 31 31 31 31 31 31 31 31 31 31 31 31 31 31 31 31 22 22 22 22 22 22 22 22 22 22 23 23 23 23 23 23 23 23 23 23 2 2 2 2 2 2 2 2 2 2 3 3 3 3 3 3 3 3 3 3 1 1 1 1 1 1 1 1 1 1]}",
    energy: "",
    extras: [AMMO_REGEN_21, "{234:42}", "{234:62}"]
  },
  {
    id: "terra-mega",
    label: "Terra Mega Shield",
    notes: "5-manufacturer legendary stacking. Massive Capacity + Divider + Healthy. Heavy energy perks.",
    legendaries: [legStack(293, 1, 25) + " " + legStack(293, 2, 25).replace("{293:[", "").replace("]}", ""), "{279:[" + rep(1, 50) + " " + rep(8, 25) + "]}", "{300:[" + rep(6, 50) + " " + rep(8, 25) + " " + rep(11, 50) + "]}", "{312:[" + rep(6, 15) + " " + rep(8, 2) + "]}"].map(s => {
      // Just use the original tokens from Terra
      return s;
    }),
    universal: "",
    armor: "",
    energy: "",
    extras: [AMMO_REGEN_39, "{234:42}", "{234:62}"]
  },
  {
    id: "terra-everything",
    label: "Terra Everything Shield",
    notes: "Kitchen sink: 6 manufacturer legendaries, massive class mod perks, energy stacking, enhancement IDs.",
    legendaries: [legStack(300, 8, 10), "{312:[" + rep(8, 3) + " " + rep(6, 3) + "]}", legStack(321, 6, 50), legStack(283, 6, 5), legStack(306, 8, 25)],
    universal: "",
    armor: "",
    energy: "",
    extras: [
      block(234, [...Array(69).fill(41), ...Array(10).fill(53), ...Array(10).fill(33), ...Array(25).fill(3), ...Array(66).fill(61), ...Array(56).fill(59), 42, ...Array(51).fill(57), 62]),
      block(247, [...Array(10).fill(81), ...Array(10).fill(182), ...Array(10).fill(169)])
    ]
  }
];

// ═══════════════════════════════════════════════════════
// NEW RECIPES — 35 variations
// ═══════════════════════════════════════════════════════

const newRecipes = [
  // ── DEFENSE FOCUSED (6) ──
  {
    id: "iron-wall",
    label: "Iron Wall",
    notes: "Pure defense: Exoskeleton + Shield Boi + Shallot Shell. Max armor stacking, Divider x40, Capacity x40.",
    legendaries: [legStack(283, 11, 20), legStack(287, 6, 20), legStack(306, 8, 20)],
    universal: universalBlock({ 30: 40, 54: 40, 50: 25, 55: 20, 56: 15 }),
    armor: armorBlock({ 8: 25, 9: 25, 20: 20, 21: 20, 31: 25, 1: 10, 2: 10 }),
    energy: "",
    extras: [AMMO_REGEN_15]
  },
  {
    id: "fortress",
    label: "Fortress",
    notes: "Vladof triple legendary + Torgue Sisyphusian. Heavy armor, massive Divider stacking.",
    legendaries: [legStack(283, 6, 15), legStack(283, 8, 15), legStack(283, 11, 15), legStack(321, 9, 20)],
    universal: universalBlock({ 30: 50, 54: 30, 50: 20, 57: 15, 58: 15 }),
    armor: armorBlock({ 8: 20, 9: 20, 20: 15, 21: 15, 4: 10, 5: 10, 31: 20 }),
    energy: "",
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "turtle-mode",
    label: "Turtle Mode",
    notes: "Tediore Bininu + Jakobs Vintage for max shield delay reduction + massive Capacity.",
    legendaries: [legStack(287, 9, 25), legStack(306, 7, 25), legStack(283, 11, 15)],
    universal: universalBlock({ 54: 50, 30: 30, 56: 20, 50: 20 }),
    armor: armorBlock({ 20: 25, 21: 25, 8: 15, 9: 15, 31: 15 }),
    energy: energyBlock({ 1: 10, 2: 10, 3: 10 }),
    extras: []
  },
  {
    id: "diamond-skin",
    label: "Diamond Skin",
    notes: "Order Glass + Vladof Exoskeleton + Torgue Bundled. Massive armor + health stacking.",
    legendaries: [legStack(293, 1, 20), legStack(283, 11, 20), legStack(321, 6, 15)],
    universal: universalBlock({ 30: 35, 54: 35, 55: 20, 50: 25, 57: 20 }),
    armor: armorBlock({ 1: 15, 2: 15, 3: 15, 8: 20, 9: 20, 22: 10, 23: 10 }),
    energy: "",
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "bulwark",
    label: "Bulwark",
    notes: "Jakobs Shallot Shell x30 + Tediore Shield Boi x30. Double manufacturer defense wall.",
    legendaries: [legStack(306, 8, 30), legStack(287, 6, 30)],
    universal: universalBlock({ 30: 40, 54: 40, 50: 30 }),
    armor: armorBlock({ 8: 30, 9: 30, 31: 25, 20: 15, 21: 15 }),
    energy: "",
    extras: []
  },
  {
    id: "adamantine",
    label: "Adamantine",
    notes: "All defensive legendaries from 4 manufacturers. Pure survivability, no offense.",
    legendaries: [legStack(283, 11, 15), legStack(287, 6, 15), legStack(306, 8, 15), legStack(321, 9, 15)],
    universal: universalBlock({ 30: 35, 54: 35, 50: 25, 55: 20, 56: 15, 58: 15 }),
    armor: armorBlock({ 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 8: 15, 9: 15, 20: 10, 21: 10 }),
    energy: energyBlock({ 1: 8, 2: 8, 3: 8 }),
    extras: [AMMO_REGEN_15]
  },

  // ── OFFENSE FOCUSED (5) ──
  {
    id: "berserker",
    label: "Berserker",
    notes: "Vladof Bareknuckle x30 + Ripper Overshield Eater x30. Pure melee/damage output.",
    legendaries: [legStack(283, 8, 30), legStack(300, 8, 30)],
    universal: universalBlock({ 27: 15, 28: 15, 35: 20, 36: 20, 37: 15, 38: 15 }),
    armor: "",
    energy: energyBlock({ 4: 15, 5: 15, 6: 15, 7: 15 }),
    extras: [...MOVE_SPEED]
  },
  {
    id: "power-surge",
    label: "Power Surge",
    notes: "Daedalus Power Play x25 + Order Direct Current x25. Massive energy damage + shield break effects.",
    legendaries: [legStack(312, 8, 25), legStack(293, 2, 25)],
    universal: universalBlock({ 35: 25, 36: 25, 37: 20, 38: 20, 27: 15, 28: 15 }),
    armor: "",
    energy: energyBlock({ 1: 15, 2: 15, 4: 15, 5: 15, 8: 10 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "wrecking-ball",
    label: "Wrecking Ball",
    notes: "Torgue Bundled x40 + Ripper Short Circuit x20. Explosive damage on kill + shock burst.",
    legendaries: [legStack(321, 6, 40), legStack(300, 6, 20)],
    universal: universalBlock({ 35: 20, 36: 20, 27: 20, 28: 20, 39: 10, 40: 10 }),
    armor: "",
    energy: energyBlock({ 6: 20, 7: 20, 8: 15 }),
    extras: [...MOVE_SPEED]
  },
  {
    id: "psycho-ward",
    label: "Psycho Ward",
    notes: "Maliwan Psychosis x30 + Vladof Bareknuckle x20. Low shield = max damage output.",
    legendaries: [legStack(279, 8, 30), legStack(283, 8, 20)],
    universal: universalBlock({ 27: 20, 28: 20, 35: 15, 36: 15, 37: 15, 38: 15 }),
    armor: armorBlock({ 4: 10, 5: 10 }),
    energy: energyBlock({ 4: 10, 5: 10, 6: 10 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "glass-cannon",
    label: "Glass Cannon",
    notes: "Order Glass x30 + Daedalus Wings of Grace x20 + Power Play x10. Maximum damage, minimal defense.",
    legendaries: [legStack(293, 1, 30), legStack(312, 6, 20), legStack(312, 8, 10)],
    universal: universalBlock({ 35: 25, 36: 25, 37: 20, 38: 20, 27: 10, 28: 10 }),
    armor: "",
    energy: energyBlock({ 1: 10, 4: 10, 5: 10, 8: 10 }),
    extras: [...MOVE_SPEED]
  },

  // ── BALANCED (5) ──
  {
    id: "equilibrium",
    label: "Equilibrium",
    notes: "One legendary per manufacturer (4 mfgs). Balanced universal + armor + energy.",
    legendaries: [legStack(283, 6, 15), legStack(300, 8, 15), legStack(312, 6, 15), legStack(321, 6, 15)],
    universal: universalBlock({ 30: 20, 54: 20, 35: 10, 36: 10, 50: 15, 55: 10, 57: 10 }),
    armor: armorBlock({ 8: 15, 9: 15, 20: 10, 21: 10 }),
    energy: energyBlock({ 1: 10, 2: 10, 4: 10 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "harmony",
    label: "Harmony",
    notes: "Maliwan Nucleosynthesis + Tediore Shield Boi + Jakobs Vintage. Regen + defense + delay reduction.",
    legendaries: [legStack(279, 1, 20), legStack(287, 6, 20), legStack(306, 7, 15)],
    universal: universalBlock({ 30: 25, 54: 25, 50: 15, 55: 15, 56: 10, 57: 10 }),
    armor: armorBlock({ 8: 15, 9: 15, 20: 10, 21: 10, 1: 10 }),
    energy: energyBlock({ 1: 10, 2: 10, 3: 10 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "all-rounder",
    label: "All-Rounder",
    notes: "5 manufacturer legendaries — one from each. Jack of all trades shield.",
    legendaries: [legStack(279, 1, 10), legStack(283, 6, 10), legStack(293, 2, 10), legStack(306, 8, 10), legStack(321, 6, 10)],
    universal: universalBlock({ 30: 15, 54: 15, 50: 10, 35: 8, 36: 8, 55: 8, 57: 8 }),
    armor: armorBlock({ 8: 10, 9: 10, 20: 10 }),
    energy: energyBlock({ 1: 8, 2: 8, 4: 8 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "templar",
    label: "Templar",
    notes: "Order + Jakobs + Tediore. Balanced defense with moderate offense. Class mod perks.",
    legendaries: [legStack(293, 1, 15), legStack(293, 2, 10), legStack(306, 8, 15), legStack(287, 6, 15)],
    universal: universalBlock({ 30: 25, 54: 25, 50: 15, 56: 10, 55: 10 }),
    armor: armorBlock({ 8: 15, 9: 15, 31: 10, 20: 10, 21: 10 }),
    energy: energyBlock({ 1: 8, 2: 8 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "juggernaut",
    label: "Juggernaut",
    notes: "Vladof Refreshments + Ripper Backdoor + Torgue Sisyphusian. Tanky with sustain.",
    legendaries: [legStack(283, 6, 20), legStack(300, 11, 20), legStack(321, 9, 15)],
    universal: universalBlock({ 30: 30, 54: 30, 50: 20, 55: 15, 58: 10 }),
    armor: armorBlock({ 8: 20, 9: 20, 31: 15, 2: 10, 3: 10 }),
    energy: "",
    extras: [AMMO_REGEN_15]
  },

  // ── SPEED / UTILITY (4) ──
  {
    id: "quicksilver",
    label: "Quicksilver",
    notes: "Max movement speed + ammo regen. Daedalus Wings of Grace + Tediore Shield Boi. Class mod movement perks.",
    legendaries: [legStack(312, 6, 25), legStack(287, 6, 20)],
    universal: universalBlock({ 50: 30, 54: 20, 30: 15, 55: 15, 56: 10 }),
    armor: armorBlock({ 4: 10, 5: 10 }),
    energy: energyBlock({ 1: 10, 2: 10, 3: 10 }),
    extras: [AMMO_REGEN_39, ...MOVE_SPEED, block(234, [...Array(20).fill(41), ...Array(15).fill(3)])]
  },
  {
    id: "marathon",
    label: "Marathon",
    notes: "Triple class mod perks + heavy ammo regen. Shield Boi + Refreshments for sustain.",
    legendaries: [legStack(287, 6, 20), legStack(283, 6, 20)],
    universal: universalBlock({ 50: 25, 54: 20, 30: 15, 55: 10 }),
    armor: armorBlock({ 4: 10, 5: 10, 8: 10 }),
    energy: "",
    extras: [AMMO_REGEN_39, ...MOVE_SPEED, block(234, [...Array(30).fill(41), ...Array(20).fill(61), ...Array(15).fill(59)])]
  },
  {
    id: "phantom",
    label: "Phantom",
    notes: "Maliwan Nucleosynthesis + Daedalus Wings. Regen + flight. Enhancement IDs for stealth.",
    legendaries: [legStack(279, 1, 25), legStack(312, 6, 25)],
    universal: universalBlock({ 50: 25, 55: 20, 56: 15, 30: 15, 54: 15 }),
    armor: "",
    energy: energyBlock({ 1: 12, 2: 12, 3: 12 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED, block(247, [...Array(10).fill(81), ...Array(10).fill(169)])]
  },
  {
    id: "supply-line",
    label: "Supply Line",
    notes: "Maximum ammo regen stacking + movement speed. Vladof Refreshments + Tediore Shield Boi. Pure utility.",
    legendaries: [legStack(283, 6, 25), legStack(287, 6, 25)],
    universal: universalBlock({ 30: 20, 54: 20, 50: 20, 55: 15 }),
    armor: armorBlock({ 8: 10, 9: 10, 4: 10, 5: 10 }),
    energy: "",
    extras: [AMMO_REGEN_39, ...MOVE_SPEED]
  },

  // ── LEGENDARY COMBOS (5) ──
  {
    id: "nuclear-meltdown",
    label: "Nuclear Meltdown",
    notes: "Maliwan Nucleosynthesis x30 + Maliwan Psychosis x20 + Ripper Short Circuit x20. Radiation + shock fusion.",
    legendaries: [legStack(279, 1, 30), legStack(279, 8, 20), legStack(300, 6, 20)],
    universal: universalBlock({ 35: 20, 36: 20, 30: 20, 54: 20, 50: 15 }),
    armor: armorBlock({ 8: 10, 9: 10 }),
    energy: energyBlock({ 4: 15, 5: 15, 6: 10 }),
    extras: [AMMO_REGEN_21]
  },
  {
    id: "backdoor-breach",
    label: "Backdoor Breach",
    notes: "Ripper triple — Short Circuit + Overshield Eater + Backdoor. Full Ripper legendary suite.",
    legendaries: [legStack(300, 6, 20), legStack(300, 8, 20), legStack(300, 11, 20)],
    universal: universalBlock({ 27: 15, 28: 15, 35: 15, 36: 15, 30: 20, 54: 20 }),
    armor: armorBlock({ 8: 15, 9: 15, 31: 10 }),
    energy: energyBlock({ 1: 10, 4: 10, 8: 10 }),
    extras: [...MOVE_SPEED]
  },
  {
    id: "grand-finale",
    label: "Grand Finale",
    notes: "Torgue Bundled x50 + Sisyphusian x20 + Daedalus Power Play x15. Explosive fireworks on every kill.",
    legendaries: [legStack(321, 6, 50), legStack(321, 9, 20), legStack(312, 8, 15)],
    universal: universalBlock({ 35: 20, 36: 20, 27: 15, 28: 15, 30: 15, 54: 15 }),
    armor: "",
    energy: energyBlock({ 6: 15, 7: 15 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "vladof-supremacy",
    label: "Vladof Supremacy",
    notes: "All 3 Vladof legendaries maxed: Refreshments + Bareknuckle + Exoskeleton. Pure Vladof power.",
    legendaries: [legStack(283, 6, 25), legStack(283, 8, 25), legStack(283, 11, 25)],
    universal: universalBlock({ 30: 30, 54: 30, 50: 20, 55: 15, 57: 15 }),
    armor: armorBlock({ 8: 20, 9: 20, 20: 15, 21: 15 }),
    energy: "",
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "order-chaos",
    label: "Order & Chaos",
    notes: "Order Glass + Direct Current maxed. Massive shield break/fill effects from single manufacturer.",
    legendaries: [legStack(293, 1, 30), legStack(293, 2, 30)],
    universal: universalBlock({ 30: 25, 54: 25, 35: 20, 36: 20, 50: 15, 56: 15 }),
    armor: armorBlock({ 8: 15, 9: 15, 20: 10, 21: 10 }),
    energy: energyBlock({ 1: 12, 2: 12, 4: 12 }),
    extras: [AMMO_REGEN_15]
  },

  // ── MEGA STACKING (4) ──
  {
    id: "divider-max",
    label: "Divider Max",
    notes: "Divider (30) x80 + Capacity (54) x80. Extreme health gate stacking. Exoskeleton + Sisyphusian for armor.",
    legendaries: [legStack(283, 11, 20), legStack(321, 9, 20)],
    universal: universalBlock({ 30: 80, 54: 80, 50: 30 }),
    armor: armorBlock({ 8: 20, 9: 20, 31: 20 }),
    energy: "",
    extras: [AMMO_REGEN_15]
  },
  {
    id: "capacity-overflow",
    label: "Capacity Overflow",
    notes: "Capacity (54) x100 + Healthy (50) x50. Shield capacity through the roof. Wings of Grace for regen.",
    legendaries: [legStack(312, 6, 25), legStack(306, 8, 20), legStack(287, 6, 15)],
    universal: universalBlock({ 54: 100, 50: 50, 56: 20, 55: 15 }),
    armor: armorBlock({ 20: 15, 21: 15, 8: 10, 9: 10 }),
    energy: "",
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "energy-overload",
    label: "Energy Overload",
    notes: "Maximum energy perk stacking. Ripper Short Circuit + Daedalus Power Play for energy synergy.",
    legendaries: [legStack(300, 6, 25), legStack(312, 8, 25)],
    universal: universalBlock({ 30: 20, 54: 20, 35: 15, 36: 15 }),
    armor: "",
    energy: energyBlock({ 1: 20, 2: 20, 3: 20, 4: 20, 5: 20, 6: 15, 7: 15, 8: 15 }),
    extras: [...MOVE_SPEED]
  },
  {
    id: "legendary-flood",
    label: "Legendary Flood",
    notes: "6 manufacturers, every legendary stacked x15. Maximum legendary diversity.",
    legendaries: [
      legStack(279, 1, 15), legStack(283, 6, 15), legStack(293, 2, 15),
      legStack(300, 8, 15), legStack(312, 6, 15), legStack(321, 6, 15)
    ],
    universal: universalBlock({ 30: 20, 54: 20, 50: 15 }),
    armor: armorBlock({ 8: 10, 9: 10 }),
    energy: energyBlock({ 1: 8, 4: 8 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },

  // ── HYBRID / THEMED (5) ──
  {
    id: "vampiric",
    label: "Vampiric",
    notes: "Nucleosynthesis regen + Refreshments sustain + massive Healthy stacking. Life steal shield.",
    legendaries: [legStack(279, 1, 25), legStack(283, 6, 20), legStack(306, 7, 15)],
    universal: universalBlock({ 50: 40, 30: 25, 54: 25, 55: 15, 56: 10 }),
    armor: armorBlock({ 1: 15, 2: 15, 3: 15, 8: 10 }),
    energy: energyBlock({ 1: 10, 2: 10 }),
    extras: [AMMO_REGEN_15]
  },
  {
    id: "sentinel",
    label: "Sentinel",
    notes: "Jakobs double legendary + Order Glass. Classic sentinel shield with Vintage delay reduction.",
    legendaries: [legStack(306, 7, 20), legStack(306, 8, 20), legStack(293, 1, 15)],
    universal: universalBlock({ 30: 30, 54: 30, 50: 20, 56: 15, 55: 10 }),
    armor: armorBlock({ 8: 15, 9: 15, 20: 15, 21: 15, 31: 10 }),
    energy: "",
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "vanguard",
    label: "Vanguard",
    notes: "Tediore duo + Vladof Exoskeleton. Shield Boi + Bininu for maximum Tediore synergy + armor.",
    legendaries: [legStack(287, 6, 20), legStack(287, 9, 20), legStack(283, 11, 15)],
    universal: universalBlock({ 30: 25, 54: 25, 50: 20, 55: 15, 57: 10 }),
    armor: armorBlock({ 8: 20, 9: 20, 20: 15, 21: 15, 4: 10, 5: 10 }),
    energy: "",
    extras: [AMMO_REGEN_21]
  },
  {
    id: "daedalus-wings",
    label: "Daedalus Wings",
    notes: "Daedalus duo: Wings of Grace + Power Play maxed. Flight + power shield synergy.",
    legendaries: [legStack(312, 6, 30), legStack(312, 8, 30)],
    universal: universalBlock({ 54: 30, 30: 25, 50: 20, 35: 15, 36: 15, 55: 10, 56: 10 }),
    armor: armorBlock({ 8: 10, 9: 10 }),
    energy: energyBlock({ 1: 12, 2: 12, 4: 12, 5: 12 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "class-master",
    label: "Class Master",
    notes: "Heavy class mod perk stacking + enhancement IDs. Shield as stat stick for class builds.",
    legendaries: [legStack(283, 6, 15), legStack(300, 8, 15), legStack(321, 6, 20)],
    universal: universalBlock({ 30: 20, 54: 20, 50: 15 }),
    armor: armorBlock({ 8: 10, 9: 10 }),
    energy: "",
    extras: [
      block(234, [...Array(50).fill(41), ...Array(40).fill(61), ...Array(30).fill(59), ...Array(20).fill(3), ...Array(15).fill(57), ...Array(10).fill(53), ...Array(10).fill(33), 42, 62]),
      block(247, [...Array(10).fill(81), ...Array(10).fill(182), ...Array(10).fill(169)]),
      AMMO_REGEN_21
    ]
  },

  // ── MANUFACTURER THEMED (5) ──
  {
    id: "maliwan-fusion",
    label: "Maliwan Fusion",
    notes: "Maliwan duo maxed + energy focus. Nucleosynthesis + Psychosis for elemental shield effects.",
    legendaries: [legStack(279, 1, 30), legStack(279, 8, 25)],
    universal: universalBlock({ 35: 25, 36: 25, 30: 20, 54: 20, 50: 15 }),
    armor: armorBlock({ 4: 10, 5: 10 }),
    energy: energyBlock({ 1: 15, 2: 15, 3: 15, 4: 15, 5: 10 }),
    extras: [AMMO_REGEN_15, ...MOVE_SPEED]
  },
  {
    id: "ripper-assault",
    label: "Ripper Assault",
    notes: "All 3 Ripper legendaries. Short Circuit + Overshield Eater + Backdoor = full breach kit.",
    legendaries: [legStack(300, 6, 20), legStack(300, 8, 25), legStack(300, 11, 15)],
    universal: universalBlock({ 27: 20, 28: 20, 35: 15, 36: 15, 30: 15, 54: 15 }),
    armor: armorBlock({ 8: 10, 9: 10, 31: 10 }),
    energy: energyBlock({ 4: 12, 5: 12, 6: 12 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "torgue-party",
    label: "Torgue Party",
    notes: "Torgue Bundled x60 + Sisyphusian x25. Massive explosion stacking. It's a PARTY!",
    legendaries: [legStack(321, 6, 60), legStack(321, 9, 25)],
    universal: universalBlock({ 35: 20, 36: 20, 27: 20, 28: 20, 30: 15, 54: 15 }),
    armor: "",
    energy: energyBlock({ 6: 15, 7: 15, 8: 10 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
  {
    id: "jakobs-heritage",
    label: "Jakobs Heritage",
    notes: "Jakobs Vintage + Shallot Shell maxed. Old-school reliability with massive defense.",
    legendaries: [legStack(306, 7, 25), legStack(306, 8, 30)],
    universal: universalBlock({ 30: 30, 54: 30, 50: 25, 56: 20, 55: 15 }),
    armor: armorBlock({ 8: 20, 9: 20, 20: 15, 21: 15, 31: 15, 22: 10, 23: 10 }),
    energy: "",
    extras: [AMMO_REGEN_15]
  },
  {
    id: "tediore-recycler",
    label: "Tediore Recycler",
    notes: "Tediore Shield Boi + Bininu maxed. Shield recycle mechanics + Vladof Refreshments for sustain.",
    legendaries: [legStack(287, 6, 25), legStack(287, 9, 20), legStack(283, 6, 15)],
    universal: universalBlock({ 54: 30, 30: 25, 50: 20, 55: 15, 57: 10 }),
    armor: armorBlock({ 8: 15, 9: 15, 4: 10, 5: 10 }),
    energy: energyBlock({ 1: 10, 2: 10, 3: 10 }),
    extras: [AMMO_REGEN_21, ...MOVE_SPEED]
  },
];

// Combine all recipes
const allRecipes = [...terraRecipes, ...newRecipes];

// Write to file
const outPath = path.join(__dirname, "..", "web", "public", "data", "shield_recipes.json");
fs.writeFileSync(outPath, JSON.stringify(allRecipes, null, 2));
console.log(`Wrote ${allRecipes.length} shield recipes to ${outPath}`);
