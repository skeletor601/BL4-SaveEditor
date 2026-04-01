export interface ClassModNameInfo {
  character: "Amon" | "Harlowe" | "Rafa" | "Vex" | "C4SH";
  description: string;
}

/** Lookup by lowercase name. */
export const CLASS_MOD_NAME_DESCRIPTIONS: Record<string, ClassModNameInfo> = {
  // ── Amon ──────────────────────────────────────────────────────────────────
  "blacksmith":    { character: "Amon", description: "Kill Skill. Partially restores duration of active Forgedrones. Each active Forgedrone increases your Gun Damage." },
  "elementalist":  { character: "Amon", description: "When you gain stacks via any Affinity Skill, all other unlocked Affinity Skills also gain a stack. Each combined stack increases your Movement Speed." },
  "forge master":  { character: "Amon", description: "All Forge Skills can now be used once while on cooldown." },
  "furnace":       { character: "Amon", description: "Damage from Fellfrost, Hoarcleave, Fulminating Fist, and Stormcutter converts to Incendiary damage." },
  "lamplighter":   { character: "Amon", description: "Critical Hits with guns restore 1.5% Action Skill Duration. While the action skill is active, Amon gains 1 stack per second (up to 50), each granting +1.4% Gun Damage and +2% Melee Damage." },
  "shatterwight":  { character: "Amon", description: "Forgewaves deal Melee damage alongside other types. Melee attacks while Scourge is active gain increased Cryo Efficiency and Radius." },
  "viking":        { character: "Amon", description: "Crucible gains +2 charges and increased duration. Grants increased damage reduction while Crucible is active." },
  "tempest":       { character: "Amon", description: "Dealing Gun Damage grants Storm for 20 seconds, increasing Shock Damage, stacking up to 50 times. Activating a Forgeskill causes Elemental Bolts to strike random nearby enemies for 10 seconds, dealing Shock Skill Damage based on Maximum Shield Capacity. \"Hell is empty and all the devils are here.\"" },

  // ── Harlowe ───────────────────────────────────────────────────────────────
  "bio-robot":     { character: "Harlowe", description: "Entangling enemies creates alternating Cryo and Radiation hazards around them." },
  "driver":        { character: "Harlowe", description: "Firing CHROMA Accelerator drains all but 1 HP and amps the shot. CHROMA Accelerator gains +20% Lifesteal." },
  "generator":     { character: "Harlowe", description: "Activating Flux Generator decreases remaining action skill duration by 50% and grants +200% action skill power." },
  "reactor":       { character: "Harlowe", description: "Entangling enemies grants Reactor stacks that increase movement speed. At 10 stacks: bonus damage, fire rate, reload speed, and status effect bonuses." },
  "scientist":     { character: "Harlowe", description: "Shocking enemies automatically Entangles and Irradiates them. Entangling enemies arcs Shock to nearby enemies." },
  "skeptic":       { character: "Harlowe", description: "Slamming Stasised enemies fires homing Radiation and Cryo darts. Shooting enemies with an active status effect restores 5% of Action Skill cooldown." },
  "trooper":       { character: "Harlowe", description: "Critical Hits with guns restore 4% Ordnance Cooldown. On Ordnance Activation, gain +50% Gun Damage and +50% Action Skill Damage for 8 seconds." },
  "phlebotomist":  { character: "Harlowe", description: "While Harlowe's Action Skill is active, dealing Gun Damage to an enemy has a chance to cause a Hemorrhage, dealing Kinetic Status Effect Damage based on Damage Dealt. Hemorrhage deals twice as much Damage to Bosses. \"Be the reason someone gets a second death.\"" },

  // ── Rafa ──────────────────────────────────────────────────────────────────
  "buster":        { character: "Rafa", description: "APOPHIS Lance gains a 25% chance to not consume charges. Higher charge usage increases this chance." },
  "dancer":        { character: "Rafa", description: "Overdrive bonuses increase by 100%. Overdrive ends when Rafa's action skill ends." },
  "esgrimidor":    { character: "Rafa", description: "Melee attacks gain +10% critical hit chance. Critical hits with Melee restore 5% of Action Skill Duration." },
  "filántropo":    { character: "Rafa", description: "Retriggering Rafa's action skill spawns a free grenade based on the equipped grenade. 4-second cooldown." },
  "filantropo":    { character: "Rafa", description: "Retriggering Rafa's action skill spawns a free grenade based on the equipped grenade. 4-second cooldown." },
  "grenazerker":   { character: "Rafa", description: "Whenever Rafa throws a grenade or a Tediore gun, an additional one is thrown automatically." },
  "instigator":    { character: "Rafa", description: "Firing the Peacebreaker Cannon at enemies grants Instigator stacks. Each stack grants +2% Gun Damage." },
  "overdriver":    { character: "Rafa", description: "Rafa gains +15% Gun Damage and +15% Ordnance Damage while walking, scaling with movement speed. Also grants a fixed +20% Move Speed." },
  "reaparicion":   { character: "Rafa", description: "Melee Damage has a chance to cause a Blade Storm for 5 seconds, dealing Kinetic Melee Damage based on Damage Dealt. Action Skill Melee Damage have double the chance. Up to 3 Blade Storms can be active at a time. \"Cada quien tiene la muerte que se busca.\"" },

  // ── Vex ───────────────────────────────────────────────────────────────────
  "avatar":            { character: "Vex", description: "Vex and her minions gain increased damage for each active Attunement Skill. Each Attunement also grants damage reduction matching its element type." },
  "illusionist":       { character: "Vex", description: "Specters and Reapers have a chance to spawn as Badasses with increased health and damage. This is guaranteed at least once every 90 seconds." },
  "kindread spirits":  { character: "Vex", description: "Using a Command Skill grants bonus Kinetic Minion Gun Damage for a duration. The Command Skill itself also deals gun damage." },
  "misericorde":       { character: "Vex", description: "Phase Daggers gain a 25% chance to Ricochet. Critical Hits grant a stack of Misery for 20s (+1.4% Skill Damage per stack, up to 50 stacks)." },
  "technomancer":      { character: "Vex", description: "Eldritch Blast deals additional Ordnance damage. Killing enemies or using grenades resets its cooldown." },
  "teen witch":        { character: "Vex", description: "When at max HP, Lifesteal partially applies to shields. When at max Shield, Lifesteal partially grants Overshield." },
  "undead eye":        { character: "Vex", description: "Killing enemies with Sniper Rifles triggers Blood Shot. Critically hitting has a 33% chance to trigger Blood Shot as well." },
  "configuration":     { character: "Vex", description: "When Vex activates an Action Skill or Command Skill, open a Blood Rift for a duration. Maximum of 2 active Blood Rifts at a time. Blood Rifts rapidly fire Remnant Minions, dealing Kinetic Gun Damage based on her Current Weapon when spawned. \"No need to waste such sweet suffering.\"" },

  // ── C4SH (The Rogue) — Normal ─────────────────────────────────────────────
  "pistoleer":     { character: "C4SH", description: "C4SH standard class mod." },
  "bane":          { character: "C4SH", description: "C4SH standard class mod." },
  "gambler":       { character: "C4SH", description: "C4SH standard class mod." },
  "puppeteer":     { character: "C4SH", description: "C4SH standard class mod." },
  "swindler":      { character: "C4SH", description: "C4SH standard class mod." },
  "antagonist":    { character: "C4SH", description: "C4SH standard class mod." },
  "powderbot":     { character: "C4SH", description: "C4SH standard class mod." },
  "triggerbot":    { character: "C4SH", description: "C4SH standard class mod." },
  "crack shot":    { character: "C4SH", description: "C4SH standard class mod." },
  "pack leader":   { character: "C4SH", description: "C4SH standard class mod." },
  // ── C4SH (The Rogue) — Legendary ────────────────────────────────────────
  "rounder":       { character: "C4SH", description: "Sleight of Hand gains Reduced Charges. Whenever C4SH kills an enemy with a Card, he gains Charges and resets his Action Skill Duration. Red Text: And for my next trick..." },
  "ludopath":      { character: "C4SH", description: "Whenever C4SH rolls his Bone Dice, he gains Ludopath Stacks equal to the roll. C4SH gains Fire Rate and Movement Speed for every Ludopath Stack. Red Text: They see me rollin'" },
  "hotshot":       { character: "C4SH", description: "Cross-Fire's Burst Fire is replaced with a Beam Spin Attack that deals Fire Damage. If Windfall is active, these Beams always Critically Hit. Red Text: Spin to win" },
  "cooler":        { character: "C4SH", description: "Whenever C4SH deals Ordnance Damage to an enemy, that enemy becomes Jinxed. Whenever C4SH kills a Jinxed enemy, he gains Ordnance Cooldown Rate. Red Text: Do do that voodoo that you do so well." },
  "whale":         { character: "C4SH", description: "C4SH's Action Skill Cooldown Rate is reduced to 0 and all Action Skill Cooldown Rate bonuses are converted into Action Skill Damage. When Windfall activates, fully restore Action Skill Cooldown. Red Text: I have not yet begun to defile myself." },
  "windrider":     { character: "C4SH", description: "Whenever C4SH kills an enemy with a Critical Hit from a Gun, he doubles his Fortune Stacks, otherwise killing an enemy with a Gun drains Fortune Stacks. Red Text: Play to win. Never play to not lose." },
  "gamer":         { character: "C4SH", description: "Whenever C4SH Critically Hits an enemy with a Gun, Bleed that enemy. Whenever C4SH kills an enemy with Bleed with a Critical Hit, he gains bonus damage. Red Text: Luck is what happens when preparation meets opportunity." },
  "hooligan":      { character: "C4SH", description: "Whenever C4SH kills an enemy, gain a stack of Hooligan. Whenever C4SH deals Grenade Damage, consume all Hooligan Stacks and deal Bonus Fire Damage based on the number of Stacks. Red Text: Here we go, here we go, here we go!" },
};

const CHARACTER_COLORS: Record<string, string> = {
  Amon:    "text-orange-300",
  Harlowe: "text-cyan-300",
  Rafa:    "text-green-300",
  Vex:     "text-purple-300",
  C4SH:    "text-red-300",
};

export function getClassModNameInfo(nameEN: string): ClassModNameInfo | undefined {
  // Normalize: lowercase, strip diacritics for matching
  const key = nameEN.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  // Try exact match first, then normalized
  const direct = CLASS_MOD_NAME_DESCRIPTIONS[nameEN.toLowerCase()];
  if (direct) return direct;
  const entry = Object.entries(CLASS_MOD_NAME_DESCRIPTIONS).find(
    ([k]) => k.normalize("NFD").replace(/\p{Diacritic}/gu, "") === key
  );
  return entry?.[1];
}

export { CHARACTER_COLORS };
