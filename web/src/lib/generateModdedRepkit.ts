/**
 * Modded Repkit Generator — recipe combinator system.
 *
 * 8 primary archetypes × 8 sub-variants = 64 unique named recipes.
 * Each recipe defines unique perk weights, class mod focus, and cross-mfg preferences.
 * Random flavor modifiers add further variation per roll.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RepkitBuilderPart { partId: number; stat: string; description?: string }
export interface RepkitBuilderLegendaryPart extends RepkitBuilderPart { mfgId: number; mfgName: string }
export interface RepkitBuilderRarity { id: number; label: string }
export interface RepkitBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, RepkitBuilderRarity[]>;
  prefix: RepkitBuilderPart[];
  firmware: RepkitBuilderPart[];
  resistance: RepkitBuilderPart[];
  universalPerks: RepkitBuilderPart[];
  legendaryPerks: RepkitBuilderLegendaryPart[];
  modelsByMfg: Record<number, number | null>;
}
export interface GenerateModdedRepkitOptions {
  level?: number;
  modPowerMode?: "stable" | "op" | "insane";
  forcedMfgId?: number;
}
export interface RepkitStatEstimate {
  archetypeName: string;
  archetypeDesc: string;
  legendaryName: string;
  legendaryEffect: string;
  mfgName: string;
  prefixName: string;
  firmwareName: string;
  healingStacks: number;
  ampStacks: number;
  cooldownStacks: number;
  tankStacks: number;
  leechStacks: number;
  overdoseStacks: number;
  classModStacks: number;
  crossMfgLegendaries: string[];
  allPerks: { name: string; stacks: number; description?: string; color: string }[];
  classModPerks: { name: string; stacks: number; id: number }[];
}
export interface GenerateModdedRepkitResult { code: string; stats: RepkitStatEstimate }

// ── Game Data Constants ────────────────────────────────────────────────────────

const MFG_IDS = [277, 265, 266, 285, 274, 290, 261, 269] as const;
const MFG_NAMES: Record<number, string> = {
  277: "Daedalus", 265: "Jakobs", 266: "Maliwan", 285: "Order",
  274: "Ripper", 290: "Tediore", 261: "Torgue", 269: "Vladof",
};
const MFG_LEG: Record<number, { pid: number; name: string; fx: string }> = {
  277: { pid: 1, name: "Pulseometer", fx: "Continuous health regen, rate increases when low" },
  265: { pid: 6, name: "Cardiac Shot", fx: "Below 20% HP, 50% chance to refill 1 Charge" },
  266: { pid: 6, name: "Immunity Shot", fx: "Immunity to last elemental damage for 7s" },
  285: { pid: 1, name: "Heart Pump", fx: "3 Charges + 30% refill on kill" },
  274: { pid: 1, name: "Time Dilation", fx: "+100% Duration, -50% Cooldown" },
  290: { pid: 1, name: "Blood Siphon", fx: "On kill, overkill → healing orb" },
  261: { pid: 6, name: "Chrome", fx: "+30% Fire Rate, +30% Move Speed 15s" },
  269: { pid: 6, name: "Blood Rush", fx: "Health regen during FFYL" },
};
const MFG_MODEL: Record<number, number> = { 277: 2, 265: 7, 266: 7, 285: 2, 274: 2, 290: 2, 261: 7, 269: 7 };
const MFG_LEG_RARITY: Record<number, number> = { 277: 7, 265: 5, 266: 5, 285: 7, 274: 7, 290: 7, 261: 5, 269: 5 };
const FW_IDS = [5, 6, 10, 17, 20];
const FW_NAMES: Record<number, string> = { 5: "High Caliber", 6: "Gadget Ahoy", 10: "Deadeye", 17: "Get Throwin'", 20: "Daed-dy O'" };

// Class mod perk definitions (234:X)
type CmDef = { ids: number[]; name: string };
const CM: Record<string, CmDef> = {
  lifesteal:      { ids: [5],      name: "+10% Lifesteal" },
  gunCrit:        { ids: [13, 14], name: "+10% Gun Crit Chance" },
  dmgDealt:       { ids: [19, 20], name: "+20% Damage Dealt" },
  kinetic:        { ids: [25, 27], name: "+40% Kinetic Damage" },
  elemental:      { ids: [26, 28], name: "+25% Elemental Damage" },
  gunDmg:         { ids: [30, 50], name: "+30% Gun Damage" },
  splash:         { ids: [31, 51], name: "+35% Splash Damage" },
  skillDmg:       { ids: [32, 52], name: "+45% Skill Damage" },
  actionCD:       { ids: [33, 53], name: "+25% Action Skill CD" },
  shieldRegen:    { ids: [34, 54], name: "+50% Shield Regen Rate" },
  reload:         { ids: [35, 55], name: "+26% Reload Speed" },
  melee:          { ids: [36, 56], name: "+60% Melee Damage" },
  maxHP:          { ids: [37, 57], name: "+2603 Max Health" },
  fireRate:       { ids: [38, 58], name: "+20% Fire Rate" },
  dmgReduc:       { ids: [39, 59], name: "+25% Damage Reduction" },
  critDmg:        { ids: [40, 60], name: "+35% Crit Damage" },
  hpRegen:        { ids: [41, 61], name: "+56 Health Regen/s" },
  moveSpeed:      { ids: [42, 62], name: "+20% Movement Speed" },
  maxShield:      { ids: [47, 67], name: "+2231 Max Shield" },
  ordnanceDmg:    { ids: [17, 18], name: "+45% Ordnance Damage" },
  ordnanceCrit:   { ids: [9, 10],  name: "+10% Ordnance Crit" },
  actionSkillDmg: { ids: [15, 16], name: "+60% Action Skill Damage" },
  actionDur:      { ids: [29, 49], name: "+45% Action Skill Duration" },
  statusChance:   { ids: [21, 23], name: "+30% Status Effect Chance" },
  statusDmg:      { ids: [22, 24], name: "+30% Status Effect Damage" },
  minionDmg:      { ids: [4],     name: "+45% Minion Damage" },
};

// Universal perk display data (type 243)
const PK: Record<number, { n: string; d: string; c: string }> = {
  21: { n: "Everlasting",   d: "+20% Capacity & Duration",   c: "emerald" },
  52: { n: "Medic",         d: "Heals allies 50%",           c: "green" },
  54: { n: "Overshield",    d: "Overshield instead of heal", c: "blue" },
  56: { n: "Health Burst",  d: "+50% burst after 8s",        c: "green" },
  57: { n: "Power Cycle",   d: "Instant Shield recharge",    c: "cyan" },
  58: { n: "Leech",         d: "30% Lifesteal 8s",           c: "red" },
  59: { n: "Tank",          d: "-50% Damage Taken 8s",       c: "amber" },
  60: { n: "Everlasting+",  d: "+20% Capacity & Duration",   c: "emerald" },
  61: { n: "Enrage",        d: "+30% Dmg, +15% Taken 8s",    c: "orange" },
  62: { n: "Accelerator",   d: "+100% Action Skill CD 8s",   c: "purple" },
  63: { n: "Elem Affinity", d: "+25% Elemental Dmg 8s",      c: "yellow" },
  64: { n: "Splash Dmg",    d: "+25% Splash Dmg 8s",         c: "orange" },
  65: { n: "Reload Speed",  d: "+25% Reload 8s",             c: "cyan" },
  67: { n: "Speed",         d: "+40% Move Speed 8s",         c: "sky" },
  68: { n: "Go Go Gadget",  d: "+50% Ordnance CD 8s",        c: "violet" },
  69: { n: "Hard Hitter",   d: "+50% Melee Dmg 8s",          c: "red" },
  70: { n: "Overdose",      d: "+45% All Healing 8s",         c: "green" },
  71: { n: "Fire Rate",     d: "+15% Fire Rate 8s",           c: "amber" },
  73: { n: "Amp",           d: "+200% Dmg next shot",         c: "yellow" },
  74: { n: "Repkit Cooling",d: "-33% Cooldown",               c: "cyan" },
  98: { n: "Model+ Fire",   d: "Fire element",                c: "red" },
  99: { n: "Model+ Rad",    d: "Radiation element",           c: "yellow" },
  100:{ n: "Model+ Corr",   d: "Corrosive element",           c: "green" },
  101:{ n: "Model+ Shock",  d: "Shock element",               c: "blue" },
  102:{ n: "Model+ Cryo",   d: "Cryo element",                c: "cyan" },
  106:{ n: "Mega Prefix",   d: "Max healing, longer CD",      c: "emerald" },
  // Resistances
  22: { n: "Shock Resist",  d: "+50% Shock Resistance 10s",    c: "blue" },
  23: { n: "Rad Resist",    d: "+50% Radiation Resistance 10s",c: "yellow" },
  24: { n: "Fire Resist",   d: "+50% Fire Resistance 10s",     c: "red" },
  25: { n: "Cryo Resist",   d: "+50% Cryo Resistance 10s",     c: "cyan" },
  26: { n: "Corr Resist",   d: "+50% Corrosive Resistance 10s",c: "green" },
  47: { n: "Rad Resist+",   d: "+50% Radiation Resistance 10s",c: "yellow" },
  48: { n: "Cryo Resist+",  d: "+50% Cryo Resistance 10s",     c: "cyan" },
  49: { n: "Shock Resist+", d: "+50% Shock Resistance 10s",    c: "blue" },
  50: { n: "Fire Resist+",  d: "+50% Fire Resistance 10s",     c: "red" },
  51: { n: "Corr Resist+",  d: "+50% Corrosive Resistance 10s",c: "green" },
  // Immunities
  27: { n: "Shock Immune",  d: "Shock Immunity 3s",            c: "blue" },
  28: { n: "Rad Immune",    d: "Radiation Immunity 3s",        c: "yellow" },
  29: { n: "Fire Immune",   d: "Fire Immunity 3s",             c: "red" },
  30: { n: "Cryo Immune",   d: "Cryo Immunity 3s",             c: "cyan" },
  31: { n: "Corr Immune",   d: "Corrosive Immunity 3s",        c: "green" },
  42: { n: "Shock Immune+", d: "Shock Immunity 3s",            c: "blue" },
  43: { n: "Rad Immune+",   d: "Radiation Immunity 3s",        c: "yellow" },
  44: { n: "Fire Immune+",  d: "Fire Immunity 3s",             c: "red" },
  45: { n: "Cryo Immune+",  d: "Cryo Immunity 3s",             c: "cyan" },
  46: { n: "Corr Immune+",  d: "Corrosive Immunity 3s",        c: "green" },
  // Novas
  37: { n: "Corr Nova",     d: "Corrosive Nova on use",        c: "green" },
  38: { n: "Cryo Nova",     d: "Cryo Nova on use",             c: "cyan" },
  39: { n: "Fire Nova",     d: "Fire Nova on use",             c: "red" },
  40: { n: "Rad Nova",      d: "Radiation Nova on use",        c: "yellow" },
  41: { n: "Shock Nova",    d: "Shock Nova on use",            c: "blue" },
  // Splats
  32: { n: "Shock Splat",   d: "Spawns Shock Splat",           c: "blue" },
  33: { n: "Rad Splat",     d: "Spawns Radiation Splat",       c: "yellow" },
  34: { n: "Cryo Splat",    d: "Spawns Cryo Splat",            c: "cyan" },
  35: { n: "Corr Splat",    d: "Spawns Corrosive Splat",       c: "green" },
  36: { n: "Fire Splat",    d: "Spawns Fire Splat",            c: "red" },
};

// ── Recipe Combinator ──────────────────────────────────────────────────────────

type R2 = [number, number]; // range tuple
interface SubRecipe {
  name: string;
  desc: string;
  preferMfgs?: number[];
  perks: Record<number, R2>;
  cm: { key: string; range: R2 }[];
  crossLeg: R2;
  ripper: R2;
  mega: R2;
  modelPlus: R2;
}

// Helper to merge base + sub variant perks
function sub(name: string, desc: string, perks: Record<number, R2>, cm: { key: string; range: R2 }[], opts?: Partial<Pick<SubRecipe, "preferMfgs" | "crossLeg" | "ripper" | "mega" | "modelPlus">>): SubRecipe {
  return {
    name, desc, perks, cm,
    crossLeg: opts?.crossLeg ?? [4, 6],
    ripper: opts?.ripper ?? [80, 130],
    mega: opts?.mega ?? [80, 120],
    modelPlus: opts?.modelPlus ?? [30, 50],
    preferMfgs: opts?.preferMfgs,
  };
}

const RECIPES: SubRecipe[] = [
  // ═══ TANK (8) ═══
  sub("Ironclad",          "Pure damage reduction — walls of steel.",
    { 106:[90,130], 59:[40,60], 21:[60,90], 54:[20,35], 70:[12,20], 74:[10,15], 57:[5,10] },
    [{ key:"dmgReduc", range:[200,400] }, { key:"maxHP", range:[100,200] }, { key:"maxShield", range:[80,150] }, { key:"hpRegen", range:[40,80] }],
    { ripper:[120,180], mega:[120,160] }),
  sub("Fortress",          "Max shield capacity + shield regen. Energy shield fortress.",
    { 106:[80,110], 57:[15,25], 54:[25,40], 21:[50,80], 59:[20,30], 74:[10,18], 70:[10,15] },
    [{ key:"maxShield", range:[200,350] }, { key:"shieldRegen", range:[150,300] }, { key:"dmgReduc", range:[80,150] }, { key:"maxHP", range:[60,100] }],
    { mega:[100,140] }),
  sub("Regenerator",       "Health regen stacking — never stop healing.",
    { 106:[100,150], 21:[80,120], 70:[25,40], 56:[15,25], 52:[10,18], 74:[10,15], 59:[10,15] },
    [{ key:"hpRegen", range:[200,400] }, { key:"maxHP", range:[100,200] }, { key:"dmgReduc", range:[60,120] }, { key:"lifesteal", range:[40,80] }],
    { ripper:[130,200], mega:[120,170], preferMfgs:[277] }),
  sub("Overshield Wall",   "Overshield stacking — extra health layers on top.",
    { 106:[80,110], 54:[35,55], 21:[50,80], 59:[20,35], 57:[10,18], 70:[10,15], 74:[8,12] },
    [{ key:"maxShield", range:[150,300] }, { key:"dmgReduc", range:[120,250] }, { key:"shieldRegen", range:[80,150] }, { key:"maxHP", range:[60,100] }]),
  sub("Juggernaut",        "Tank + damage dealt. Survive and hit back.",
    { 106:[80,110], 59:[30,45], 21:[50,70], 61:[15,25], 73:[10,18], 70:[10,15], 58:[8,12], 74:[8,12] },
    [{ key:"dmgReduc", range:[150,300] }, { key:"dmgDealt", range:[80,150] }, { key:"maxHP", range:[60,120] }, { key:"critDmg", range:[40,80] }]),
  sub("Bulwark",           "Team tank — medic + damage reduction. Protect the squad.",
    { 106:[90,130], 59:[25,40], 52:[20,35], 21:[60,90], 70:[15,25], 56:[10,18], 74:[10,15], 57:[5,10] },
    [{ key:"dmgReduc", range:[150,250] }, { key:"hpRegen", range:[100,200] }, { key:"maxHP", range:[80,150] }, { key:"moveSpeed", range:[30,50] }],
    { preferMfgs:[290] }),
  sub("Permafrost Tank",   "Cryo immunity + tank. Frozen solid? Never.",
    { 106:[80,110], 59:[35,50], 21:[50,80], 54:[15,25], 70:[10,18], 74:[10,15], 57:[8,12] },
    [{ key:"dmgReduc", range:[180,350] }, { key:"maxHP", range:[100,180] }, { key:"maxShield", range:[60,100] }, { key:"elemental", range:[40,80] }],
    { modelPlus:[50,80] }),
  sub("Last Stand",        "FFYL specialist — Blood Rush + max survivability.",
    { 106:[90,130], 59:[30,45], 21:[60,90], 58:[15,25], 70:[15,25], 74:[10,18], 56:[8,15] },
    [{ key:"dmgReduc", range:[150,300] }, { key:"lifesteal", range:[100,200] }, { key:"maxHP", range:[80,150] }, { key:"hpRegen", range:[60,100] }],
    { preferMfgs:[269] }),

  // ═══ DPS (8) ═══
  sub("Glass Cannon",      "Max damage, minimal defense. One-shot everything.",
    { 106:[40,60], 73:[40,60], 61:[25,40], 71:[15,25], 21:[25,40], 63:[10,15], 64:[10,15] },
    [{ key:"critDmg", range:[200,400] }, { key:"gunDmg", range:[150,300] }, { key:"dmgDealt", range:[100,200] }, { key:"gunCrit", range:[80,150] }],
    { ripper:[50,80], mega:[40,70], crossLeg:[2,4] }),
  sub("Amp Addict",        "Amp stacking — every shot hits like a truck.",
    { 106:[50,80], 73:[50,80], 21:[30,50], 71:[10,18], 61:[10,15], 74:[10,15], 58:[8,12] },
    [{ key:"critDmg", range:[150,300] }, { key:"dmgDealt", range:[100,200] }, { key:"gunDmg", range:[80,150] }, { key:"fireRate", range:[40,80] }],
    { mega:[50,80] }),
  sub("Bullet Storm",      "Fire rate + reload + gun damage. Spray and pray.",
    { 106:[50,80], 71:[30,50], 65:[25,40], 73:[15,25], 21:[30,50], 61:[10,15], 70:[8,12] },
    [{ key:"fireRate", range:[200,400] }, { key:"reload", range:[150,300] }, { key:"gunDmg", range:[100,200] }, { key:"dmgDealt", range:[60,100] }],
    { preferMfgs:[261] }),
  sub("Crit Fisher",       "Crit chance + crit damage. Precision kills.",
    { 106:[50,80], 73:[20,35], 21:[30,50], 71:[10,18], 61:[10,15], 58:[10,15], 70:[8,12] },
    [{ key:"gunCrit", range:[200,400] }, { key:"critDmg", range:[200,400] }, { key:"gunDmg", range:[80,150] }, { key:"dmgDealt", range:[60,100] }]),
  sub("Kinetic Fury",      "Raw kinetic damage stacking. No element, pure force.",
    { 106:[50,80], 73:[25,40], 61:[15,25], 21:[30,50], 71:[10,18], 65:[8,12], 70:[8,12] },
    [{ key:"kinetic", range:[200,400] }, { key:"dmgDealt", range:[150,300] }, { key:"critDmg", range:[80,150] }, { key:"gunDmg", range:[60,120] }]),
  sub("Splash Master",     "Splash damage focus. AoE destruction.",
    { 106:[50,80], 64:[30,50], 73:[15,25], 61:[15,25], 21:[30,50], 63:[10,15], 70:[8,12] },
    [{ key:"splash", range:[200,400] }, { key:"dmgDealt", range:[100,200] }, { key:"elemental", range:[80,150] }, { key:"critDmg", range:[40,80] }]),
  sub("Ordnance Officer",  "Ordnance damage + cooldown. Ability spam.",
    { 106:[50,80], 68:[25,40], 62:[20,30], 21:[30,50], 73:[10,18], 70:[8,12], 74:[10,15] },
    [{ key:"ordnanceDmg", range:[200,400] }, { key:"ordnanceCrit", range:[100,200] }, { key:"actionCD", range:[100,200] }, { key:"dmgDealt", range:[60,100] }]),
  sub("Action Hero",       "Action skill damage + duration. Always in action.",
    { 106:[50,80], 62:[25,40], 21:[40,60], 73:[10,18], 61:[10,15], 70:[10,15], 74:[10,15] },
    [{ key:"actionSkillDmg", range:[200,400] }, { key:"actionDur", range:[150,300] }, { key:"actionCD", range:[100,200] }, { key:"skillDmg", range:[80,150] }]),

  // ═══ HEALER (8) ═══
  sub("Combat Medic",      "Team healing — medic + overdose + burst.",
    { 106:[120,170], 52:[30,50], 70:[30,50], 56:[20,35], 21:[80,120], 74:[15,25], 59:[8,12], 57:[5,10] },
    [{ key:"hpRegen", range:[200,400] }, { key:"maxHP", range:[100,200] }, { key:"dmgReduc", range:[50,100] }, { key:"actionCD", range:[40,80] }],
    { preferMfgs:[277, 290], ripper:[130,190], mega:[130,180] }),
  sub("Overdose Master",   "Healing received stacking. Every heal is massive.",
    { 106:[100,150], 70:[40,65], 21:[60,90], 52:[15,25], 56:[15,25], 74:[10,18], 58:[8,12] },
    [{ key:"hpRegen", range:[200,350] }, { key:"maxHP", range:[100,200] }, { key:"lifesteal", range:[80,150] }, { key:"dmgReduc", range:[40,80] }],
    { mega:[120,170] }),
  sub("Lifesteal Lord",    "Leech stacking — damage heals you.",
    { 106:[80,110], 58:[35,55], 21:[50,80], 70:[15,25], 61:[15,25], 73:[10,15], 74:[8,12] },
    [{ key:"lifesteal", range:[200,400] }, { key:"dmgDealt", range:[100,200] }, { key:"hpRegen", range:[60,120] }, { key:"critDmg", range:[40,80] }]),
  sub("Health Surge",      "Health burst focus — delayed mega heals.",
    { 106:[100,140], 56:[30,50], 21:[60,90], 70:[20,30], 52:[10,18], 74:[10,15], 59:[8,12] },
    [{ key:"hpRegen", range:[150,300] }, { key:"maxHP", range:[120,250] }, { key:"dmgReduc", range:[60,100] }, { key:"actionCD", range:[30,60] }],
    { mega:[110,160] }),
  sub("Shield Medic",      "Power Cycle + overshield + healing. Shield-focused healer.",
    { 106:[80,120], 57:[20,35], 54:[20,35], 21:[50,80], 70:[15,25], 52:[10,18], 74:[10,15] },
    [{ key:"shieldRegen", range:[200,350] }, { key:"maxShield", range:[100,200] }, { key:"hpRegen", range:[80,150] }, { key:"dmgReduc", range:[40,80] }]),
  sub("Blood Bank",        "Cardiac Shot synergy — never run out of charges.",
    { 106:[100,140], 21:[60,90], 70:[20,35], 52:[15,25], 56:[10,18], 74:[15,25], 58:[8,12] },
    [{ key:"hpRegen", range:[150,300] }, { key:"maxHP", range:[100,200] }, { key:"actionCD", range:[80,150] }, { key:"lifesteal", range:[40,80] }],
    { preferMfgs:[265, 285] }),
  sub("Immunity Healer",   "Elemental immunity + sustained healing.",
    { 106:[90,130], 21:[60,90], 70:[20,30], 63:[15,25], 52:[10,18], 74:[10,15], 59:[10,15] },
    [{ key:"hpRegen", range:[150,300] }, { key:"elemental", range:[80,150] }, { key:"dmgReduc", range:[60,120] }, { key:"maxHP", range:[60,100] }],
    { preferMfgs:[266], modelPlus:[50,80] }),
  sub("Resurrection",      "FFYL prevention — Blood Rush + mega healing + regen.",
    { 106:[110,160], 21:[70,100], 70:[25,40], 58:[15,25], 56:[12,20], 74:[10,18], 52:[8,12] },
    [{ key:"hpRegen", range:[200,400] }, { key:"maxHP", range:[100,200] }, { key:"lifesteal", range:[80,150] }, { key:"dmgReduc", range:[60,100] }],
    { preferMfgs:[269], ripper:[140,200], mega:[130,180] }),

  // ═══ SPEED (8) ═══
  sub("Speed Demon",       "Movement speed + fire rate + reload. Fast everything.",
    { 106:[60,90], 67:[30,50], 71:[25,40], 65:[25,40], 21:[40,60], 62:[10,18], 73:[8,15], 74:[10,15] },
    [{ key:"moveSpeed", range:[200,400] }, { key:"fireRate", range:[150,300] }, { key:"reload", range:[100,200] }, { key:"actionCD", range:[40,80] }],
    { preferMfgs:[261] }),
  sub("Chrome Rush",       "Torgue Chrome synergy — speed + fire rate stacked.",
    { 106:[60,90], 67:[35,55], 71:[30,45], 21:[40,60], 65:[15,25], 61:[10,15], 74:[8,12] },
    [{ key:"moveSpeed", range:[250,450] }, { key:"fireRate", range:[200,350] }, { key:"dmgDealt", range:[60,100] }, { key:"reload", range:[50,80] }],
    { preferMfgs:[261] }),
  sub("Quickdraw",         "Reload speed focus. Mag dumps all day.",
    { 106:[60,90], 65:[35,55], 71:[20,30], 67:[15,25], 21:[40,60], 73:[10,18], 74:[8,15] },
    [{ key:"reload", range:[250,450] }, { key:"fireRate", range:[100,200] }, { key:"gunDmg", range:[80,150] }, { key:"moveSpeed", range:[40,80] }]),
  sub("Blitz",             "Movement + melee. Close range speed fighter.",
    { 106:[60,90], 67:[30,50], 69:[20,35], 71:[15,25], 21:[40,60], 58:[10,18], 59:[8,12] },
    [{ key:"moveSpeed", range:[200,400] }, { key:"melee", range:[150,300] }, { key:"fireRate", range:[60,100] }, { key:"lifesteal", range:[40,80] }]),
  sub("Hyperdrive",        "Action skill cooldown + movement. Ability on demand.",
    { 106:[60,90], 62:[30,50], 67:[25,40], 68:[20,30], 21:[40,60], 74:[10,18], 71:[8,12] },
    [{ key:"actionCD", range:[250,450] }, { key:"moveSpeed", range:[150,300] }, { key:"actionSkillDmg", range:[80,150] }, { key:"actionDur", range:[40,80] }]),
  sub("Hit and Run",       "Speed + amp. Move fast, hit hard, move again.",
    { 106:[50,80], 67:[25,40], 73:[25,40], 71:[15,25], 21:[35,55], 65:[10,18], 74:[8,12] },
    [{ key:"moveSpeed", range:[200,350] }, { key:"dmgDealt", range:[100,200] }, { key:"critDmg", range:[80,150] }, { key:"fireRate", range:[40,80] }]),
  sub("Gadgeteer",         "Ordnance cooldown + Go Go Gadget. Grenade spam.",
    { 106:[60,90], 68:[35,55], 62:[15,25], 67:[15,25], 21:[40,60], 74:[10,18], 70:[8,12] },
    [{ key:"ordnanceDmg", range:[150,300] }, { key:"actionCD", range:[100,200] }, { key:"moveSpeed", range:[80,150] }, { key:"splash", range:[40,80] }]),
  sub("Afterburner",       "Everything fast — fire rate + reload + movement + cooldown.",
    { 106:[50,80], 71:[20,30], 65:[20,30], 67:[20,30], 62:[15,25], 21:[35,55], 74:[10,18] },
    [{ key:"fireRate", range:[150,250] }, { key:"reload", range:[150,250] }, { key:"moveSpeed", range:[150,250] }, { key:"actionCD", range:[80,150] }]),

  // ═══ ELEMENTAL (8) ═══
  sub("Elemental Storm",   "All elements + affinity. Melt everything.",
    { 106:[60,90], 63:[30,50], 64:[20,35], 21:[40,60], 61:[10,18], 70:[10,15], 58:[8,12], 74:[8,12] },
    [{ key:"elemental", range:[200,400] }, { key:"splash", range:[100,200] }, { key:"statusDmg", range:[80,150] }, { key:"statusChance", range:[60,100] }],
    { modelPlus:[60,100] }),
  sub("DoT Machine",       "Status effect focus. Poison, burn, freeze everything.",
    { 106:[60,90], 63:[25,40], 21:[40,60], 61:[15,25], 64:[10,18], 70:[10,15], 58:[8,12] },
    [{ key:"statusDmg", range:[200,400] }, { key:"statusChance", range:[200,400] }, { key:"elemental", range:[100,200] }, { key:"dmgDealt", range:[40,80] }],
    { modelPlus:[70,110] }),
  sub("Corrosive Cloud",   "Corrosive specialization. Armor melter.",
    { 106:[60,90], 63:[30,50], 64:[15,25], 21:[40,60], 61:[10,18], 70:[10,15], 74:[8,12] },
    [{ key:"elemental", range:[200,400] }, { key:"statusDmg", range:[150,300] }, { key:"splash", range:[80,150] }, { key:"dmgDealt", range:[60,100] }],
    { modelPlus:[60,90], preferMfgs:[266] }),
  sub("Pyromania",         "Fire specialization. Burn it all.",
    { 106:[60,90], 63:[30,50], 61:[20,30], 64:[15,25], 21:[40,60], 70:[10,15], 71:[8,12] },
    [{ key:"elemental", range:[200,400] }, { key:"statusDmg", range:[150,250] }, { key:"dmgDealt", range:[100,200] }, { key:"fireRate", range:[40,80] }],
    { modelPlus:[60,90] }),
  sub("Cryo Lock",         "Cryo specialization. Freeze and shatter.",
    { 106:[60,90], 63:[30,50], 21:[40,60], 59:[15,25], 73:[10,18], 70:[10,15], 74:[8,12] },
    [{ key:"elemental", range:[200,400] }, { key:"critDmg", range:[100,200] }, { key:"dmgDealt", range:[80,150] }, { key:"statusChance", range:[60,100] }],
    { modelPlus:[60,90] }),
  sub("Shock Trooper",     "Shock specialization. Shield stripper.",
    { 106:[60,90], 63:[30,50], 64:[15,25], 21:[40,60], 57:[10,18], 71:[10,15], 70:[8,12] },
    [{ key:"elemental", range:[200,400] }, { key:"splash", range:[100,200] }, { key:"dmgDealt", range:[80,150] }, { key:"statusChance", range:[60,100] }],
    { modelPlus:[60,90] }),
  sub("Radiation Zone",    "Radiation specialization. Irradiate the battlefield.",
    { 106:[60,90], 63:[30,50], 64:[15,25], 21:[40,60], 61:[10,18], 70:[10,15], 67:[8,12] },
    [{ key:"elemental", range:[200,400] }, { key:"statusDmg", range:[150,300] }, { key:"splash", range:[80,150] }, { key:"dmgDealt", range:[60,100] }],
    { modelPlus:[60,90] }),
  sub("Elemental Amp",     "Element + amp combo. Elemental crits that one-shot.",
    { 106:[50,80], 63:[25,40], 73:[25,40], 21:[35,55], 61:[10,18], 71:[8,12], 58:[8,12] },
    [{ key:"elemental", range:[150,300] }, { key:"critDmg", range:[150,300] }, { key:"dmgDealt", range:[80,150] }, { key:"gunCrit", range:[40,80] }],
    { modelPlus:[50,80] }),

  // ═══ BRAWLER (8) ═══
  sub("Fist of Fury",      "Pure melee damage. Punch everything to death.",
    { 106:[60,90], 69:[40,60], 58:[20,30], 59:[15,25], 21:[40,60], 67:[10,15], 70:[8,12] },
    [{ key:"melee", range:[250,450] }, { key:"dmgDealt", range:[100,200] }, { key:"lifesteal", range:[80,150] }, { key:"dmgReduc", range:[60,100] }]),
  sub("Iron Fist",         "Melee + tank. Hit hard, take hits.",
    { 106:[70,100], 69:[30,45], 59:[25,40], 21:[50,80], 58:[15,25], 70:[10,18], 54:[8,12] },
    [{ key:"melee", range:[200,350] }, { key:"dmgReduc", range:[150,300] }, { key:"maxHP", range:[80,150] }, { key:"lifesteal", range:[60,100] }],
    { ripper:[100,160] }),
  sub("Whirlwind",         "Melee + speed. Dash through enemies.",
    { 106:[60,90], 69:[30,45], 67:[25,40], 71:[10,18], 21:[40,60], 58:[10,15], 74:[8,12] },
    [{ key:"melee", range:[200,350] }, { key:"moveSpeed", range:[150,300] }, { key:"dmgDealt", range:[60,100] }, { key:"lifesteal", range:[40,80] }]),
  sub("Blood Knuckles",    "Melee + lifesteal. Every punch heals.",
    { 106:[60,90], 69:[30,50], 58:[30,50], 21:[40,60], 61:[10,15], 70:[10,15], 59:[8,12] },
    [{ key:"melee", range:[200,350] }, { key:"lifesteal", range:[200,350] }, { key:"dmgDealt", range:[60,100] }, { key:"hpRegen", range:[40,80] }]),
  sub("Ground Pound",      "Melee + splash. AoE melee destruction.",
    { 106:[60,90], 69:[30,45], 64:[25,40], 21:[40,60], 63:[10,18], 61:[10,15], 58:[8,12] },
    [{ key:"melee", range:[200,350] }, { key:"splash", range:[150,300] }, { key:"dmgDealt", range:[80,150] }, { key:"elemental", range:[40,80] }]),
  sub("Berserker Rage",    "Enrage + melee + leech. Angry healing puncher.",
    { 106:[60,90], 69:[25,40], 61:[25,40], 58:[20,30], 21:[40,60], 70:[10,15], 59:[8,12] },
    [{ key:"melee", range:[150,300] }, { key:"dmgDealt", range:[150,300] }, { key:"lifesteal", range:[80,150] }, { key:"fireRate", range:[40,80] }]),
  sub("Prizefighter",      "Melee crit specialist. Find the weak spot.",
    { 106:[50,80], 69:[30,50], 73:[15,25], 21:[35,55], 58:[10,18], 67:[10,15], 70:[8,12] },
    [{ key:"melee", range:[200,350] }, { key:"critDmg", range:[150,300] }, { key:"gunCrit", range:[80,150] }, { key:"dmgDealt", range:[40,80] }]),
  sub("Titan",             "Melee + max health + damage reduction. Immovable object.",
    { 106:[80,110], 69:[25,40], 59:[25,40], 21:[50,80], 56:[10,18], 70:[10,15], 54:[8,12] },
    [{ key:"melee", range:[150,250] }, { key:"dmgReduc", range:[150,250] }, { key:"maxHP", range:[150,250] }, { key:"hpRegen", range:[80,150] }],
    { ripper:[110,170] }),

  // ═══ SUPPORT (4) ═══
  sub("Field Commander",   "Team buffs — cooldown + medic + speed.",
    { 106:[80,110], 52:[20,35], 62:[20,30], 67:[15,25], 21:[50,80], 70:[15,25], 74:[10,18], 68:[10,15] },
    [{ key:"actionCD", range:[150,300] }, { key:"hpRegen", range:[100,200] }, { key:"moveSpeed", range:[80,150] }, { key:"dmgReduc", range:[40,80] }],
    { preferMfgs:[290], crossLeg:[5,7] }),
  sub("Supply Line",       "Cooldown reduction focus. Repkits always ready.",
    { 106:[80,120], 74:[30,50], 62:[20,35], 21:[50,80], 70:[15,25], 52:[10,18], 68:[10,15] },
    [{ key:"actionCD", range:[200,400] }, { key:"hpRegen", range:[80,150] }, { key:"dmgReduc", range:[60,100] }, { key:"moveSpeed", range:[30,60] }]),
  sub("Minion Master",     "Minion damage + skills. Summon army.",
    { 106:[60,90], 62:[20,30], 68:[15,25], 21:[40,60], 70:[10,18], 74:[10,15], 59:[8,12] },
    [{ key:"minionDmg", range:[200,400] }, { key:"skillDmg", range:[150,300] }, { key:"actionCD", range:[100,200] }, { key:"actionDur", range:[60,100] }]),
  sub("Harmony",           "Balanced everything. Jack of all trades.",
    { 106:[70,100], 21:[40,60], 59:[10,15], 70:[10,15], 73:[8,12], 58:[8,12], 67:[8,12], 62:[8,12], 74:[8,12], 71:[5,8], 65:[5,8] },
    [{ key:"dmgReduc", range:[60,100] }, { key:"dmgDealt", range:[60,100] }, { key:"hpRegen", range:[60,100] }, { key:"moveSpeed", range:[40,80] }, { key:"fireRate", range:[40,60] }]),

  // ═══ TERRA SPECIALS (4) ═══
  sub("Super Sayain",      "Terra's signature — everything cranked to the max.",
    { 106:[110,160], 21:[80,110], 52:[8,15], 70:[15,25], 58:[10,18], 56:[8,12], 59:[15,25], 74:[12,20], 73:[8,15], 61:[8,12], 64:[8,12], 63:[8,12], 67:[5,10], 65:[5,10], 71:[5,8] },
    [{ key:"dmgReduc", range:[250,500] }, { key:"hpRegen", range:[80,150] }, { key:"maxHP", range:[60,100] }, { key:"dmgDealt", range:[40,80] }, { key:"critDmg", range:[30,60] }, { key:"moveSpeed", range:[20,40] }],
    { crossLeg:[5,7], ripper:[120,200], mega:[120,180], modelPlus:[45,70] }),
  sub("Ultra Instinct",    "React to everything — speed + damage + healing all maxed.",
    { 106:[90,130], 67:[25,40], 71:[20,30], 73:[20,30], 21:[60,90], 58:[15,25], 61:[10,18], 59:[10,15], 70:[10,15], 62:[8,12] },
    [{ key:"moveSpeed", range:[150,300] }, { key:"dmgDealt", range:[100,200] }, { key:"critDmg", range:[100,200] }, { key:"dmgReduc", range:[80,150] }, { key:"fireRate", range:[40,80] }],
    { ripper:[100,160], mega:[100,150] }),
  sub("God Mode",          "No weaknesses. Every stat pushed to absurd levels.",
    { 106:[100,150], 21:[70,100], 73:[20,30], 59:[20,30], 58:[15,25], 70:[15,25], 61:[10,18], 67:[10,15], 71:[10,15], 74:[10,15], 62:[8,12], 64:[8,12], 56:[5,10] },
    [{ key:"dmgReduc", range:[150,300] }, { key:"dmgDealt", range:[100,200] }, { key:"critDmg", range:[80,150] }, { key:"maxHP", range:[80,150] }, { key:"hpRegen", range:[60,100] }, { key:"moveSpeed", range:[40,60] }],
    { crossLeg:[6,7], ripper:[130,200], mega:[110,170], modelPlus:[50,75] }),
  sub("Apocalypse",        "Damage + elements + splash + status. Total destruction.",
    { 106:[60,90], 73:[25,40], 63:[25,40], 64:[25,40], 61:[20,30], 21:[40,60], 71:[10,18], 58:[10,15], 70:[8,12] },
    [{ key:"dmgDealt", range:[150,300] }, { key:"elemental", range:[150,300] }, { key:"splash", range:[100,200] }, { key:"statusDmg", range:[80,150] }, { key:"critDmg", range:[60,100] }],
    { modelPlus:[60,100] }),
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function ri(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function pk<T>(a: readonly T[]): T { return a[Math.floor(Math.random() * a.length)]!; }
function grp(pfx: number, ids: number[]): string { return ids.length === 1 ? `{${pfx}:${ids[0]}}` : `{${pfx}:[${ids.join(" ")}]}`; }
function shuf<T>(a: readonly T[]): T[] { const r=[...a]; for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j]!,r[i]!];} return r; }

// ── Generator ──────────────────────────────────────────────────────────────────

export function generateModdedRepkit(
  _bd: RepkitBuilderData,
  opts: GenerateModdedRepkitOptions = {},
): GenerateModdedRepkitResult {
  const level = opts.level ?? 50;
  const mode = opts.modPowerMode ?? "op";
  const seed = ri(1000, 9999);
  const sc = { stable: 1.0, op: 1.5, insane: 2.25 }[mode];

  const recipe = pk(RECIPES);

  // Manufacturer
  const pool = recipe.preferMfgs?.length ? (Math.random() < 0.7 ? recipe.preferMfgs : [...MFG_IDS]) : [...MFG_IDS];
  const mfgId = opts.forcedMfgId ?? pk(pool);
  const mfg = MFG_NAMES[mfgId] ?? "Unknown";
  const leg = MFG_LEG[mfgId]!;

  const pearl = pk(["{11:82}", "{25:82}"]);
  const base = grp(mfgId, [MFG_LEG_RARITY[mfgId]!, leg.pid, MFG_MODEL[mfgId]!]);
  const fw = pk(FW_IDS);
  const fwTok = `{243:${fw}}`;

  // Cross-mfg legendaries
  const others = MFG_IDS.filter(id => id !== mfgId);
  const cCount = Math.round(ri(...recipe.crossLeg) * (sc > 1 ? 1 + (sc-1)*0.3 : 1));
  const cMfgs = shuf(others).slice(0, Math.min(cCount, others.length));
  const cToks: string[] = []; const cNames: string[] = [];

  for (const cid of cMfgs) {
    const cl = MFG_LEG[cid]!;
    const n = Math.round(ri(5,15) * sc);
    cToks.push(grp(cid, Array(n).fill(cl.pid)));
    cNames.push(`${MFG_NAMES[cid]} ${cl.name}`);
  }

  // Ripper always
  if (!cMfgs.includes(274)) {
    const n = Math.round(ri(...recipe.ripper) * (sc > 1 ? sc*0.8 : 1));
    cToks.push(grp(274, Array(n).fill(1)));
    cNames.push("Ripper Time Dilation");
  } else {
    const idx = cToks.findIndex(t => t.startsWith("{274:"));
    if (idx >= 0) { const n = Math.round(ri(...recipe.ripper)*(sc>1?sc*0.8:1)); cToks[idx] = grp(274, Array(n).fill(1)); }
  }

  // Soothing bonus
  if (mfgId !== 277 && Math.random() < 0.6) {
    cToks.push(grp(277, Array(Math.round(ri(3,8)*sc)).fill(8)));
    cNames.push("Daedalus Soothing");
  }

  // Universal perks
  const uIds: number[] = [];
  const pCounts: { id: number; count: number }[] = [];

  const mega = Math.round(ri(...recipe.mega) * sc);
  uIds.push(...Array(mega).fill(106));
  pCounts.push({ id: 106, count: mega });

  for (const [idStr, [mn, mx]] of Object.entries(recipe.perks)) {
    const id = Number(idStr);
    if (id === 106) continue;
    const n = Math.round(ri(mn, mx) * sc);
    uIds.push(...Array(n).fill(id));
    pCounts.push({ id, count: n });
  }

  const mp = Math.round(ri(...recipe.modelPlus) * sc);
  for (const mpId of [98,99,100,101,102]) { uIds.push(...Array(mp).fill(mpId)); pCounts.push({ id: mpId, count: mp }); }

  // Random elemental perks — resistance, immunity, nova, splat
  const RESISTANCES = [22, 23, 24, 25, 26, 47, 48, 49, 50, 51]; // shock/rad/fire/cryo/corrosive (both sets)
  const IMMUNITIES = [27, 28, 29, 30, 31, 42, 43, 44, 45, 46];
  const NOVAS = [37, 38, 39, 40, 41]; // corr/cryo/fire/rad/shock
  const SPLATS = [32, 33, 34, 35, 36]; // shock/rad/cryo/corr/fire

  // Pick 2-4 random resistances
  const chosenRes = shuf(RESISTANCES).slice(0, ri(2, 4));
  for (const rid of chosenRes) {
    const n = Math.round(ri(3, 8) * sc);
    uIds.push(...Array(n).fill(rid));
    pCounts.push({ id: rid, count: n });
  }

  // Pick 1-2 random immunities
  const chosenImm = shuf(IMMUNITIES).slice(0, ri(1, 2));
  for (const iid of chosenImm) {
    const n = Math.round(ri(2, 5) * sc);
    uIds.push(...Array(n).fill(iid));
    pCounts.push({ id: iid, count: n });
  }

  // 70% chance: pick 1-3 random novas
  if (Math.random() < 0.7) {
    const chosenNovas = shuf(NOVAS).slice(0, ri(1, 3));
    for (const nid of chosenNovas) {
      const n = Math.round(ri(3, 10) * sc);
      uIds.push(...Array(n).fill(nid));
      pCounts.push({ id: nid, count: n });
    }
  }

  // 50% chance: pick 1-2 random splats
  if (Math.random() < 0.5) {
    const chosenSplats = shuf(SPLATS).slice(0, ri(1, 2));
    for (const sid of chosenSplats) {
      const n = Math.round(ri(3, 8) * sc);
      uIds.push(...Array(n).fill(sid));
      pCounts.push({ id: sid, count: n });
    }
  }

  const uTok = grp(243, uIds);

  // Class mod perks
  const cmIds: number[] = [];
  const cmStats: { name: string; stacks: number; id: number }[] = [];
  for (const { key, range } of recipe.cm) {
    const cm = CM[key]; if (!cm) continue;
    const n = Math.round(ri(...range) * sc);
    const cid = pk(cm.ids);
    cmIds.push(...Array(n).fill(cid));
    cmStats.push({ name: cm.name, stacks: n, id: cid });
  }
  const cmTok = cmIds.length ? grp(234, cmIds) : "";

  // Assemble
  const parts = [pearl, base, fwTok, ...cToks, uTok, ...(cmTok ? [cmTok] : [])];
  const code = `${mfgId}, 0, 1, ${level}| 2, ${seed}|| ${parts.join(" ")} |`;

  // Stats
  const allPerks: RepkitStatEstimate["allPerks"] = [];
  for (const { id, count } of pCounts) {
    const p = PK[id];
    if (p) allPerks.push({ name: p.n, stacks: count, description: p.d, color: p.c });
  }
  const sum = (...ids: number[]) => pCounts.filter(p => ids.includes(p.id)).reduce((s, p) => s + p.count, 0);

  return {
    code,
    stats: {
      archetypeName: recipe.name,
      archetypeDesc: recipe.desc,
      legendaryName: leg.name,
      legendaryEffect: leg.fx,
      mfgName: mfg,
      prefixName: "Mega",
      firmwareName: FW_NAMES[fw] ?? `FW ${fw}`,
      healingStacks: sum(106, 21, 60, 70, 52, 56),
      ampStacks: sum(73),
      cooldownStacks: sum(74, 62),
      tankStacks: sum(59, 54),
      leechStacks: sum(58),
      overdoseStacks: sum(70),
      classModStacks: cmIds.length,
      crossMfgLegendaries: cNames,
      allPerks,
      classModPerks: cmStats,
    },
  };
}
