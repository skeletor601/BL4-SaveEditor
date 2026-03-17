export interface ClassModNameInfo {
  character: "Amon" | "Harlowe" | "Rafa" | "Vex";
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

  // ── Harlowe ───────────────────────────────────────────────────────────────
  "bio-robot":     { character: "Harlowe", description: "Entangling enemies creates alternating Cryo and Radiation hazards around them." },
  "driver":        { character: "Harlowe", description: "Firing CHROMA Accelerator drains all but 1 HP and amps the shot. CHROMA Accelerator gains +20% Lifesteal." },
  "generator":     { character: "Harlowe", description: "Activating Flux Generator decreases remaining action skill duration by 50% and grants +200% action skill power." },
  "reactor":       { character: "Harlowe", description: "Entangling enemies grants Reactor stacks that increase movement speed. At 10 stacks: bonus damage, fire rate, reload speed, and status effect bonuses." },
  "scientist":     { character: "Harlowe", description: "Shocking enemies automatically Entangles and Irradiates them. Entangling enemies arcs Shock to nearby enemies." },
  "skeptic":       { character: "Harlowe", description: "Slamming Stasised enemies fires homing Radiation and Cryo darts. Shooting enemies with an active status effect restores 5% of Action Skill cooldown." },
  "trooper":       { character: "Harlowe", description: "Critical Hits with guns restore 4% Ordnance Cooldown. On Ordnance Activation, gain +50% Gun Damage and +50% Action Skill Damage for 8 seconds." },

  // ── Rafa ──────────────────────────────────────────────────────────────────
  "buster":        { character: "Rafa", description: "APOPHIS Lance gains a 25% chance to not consume charges. Higher charge usage increases this chance." },
  "dancer":        { character: "Rafa", description: "Overdrive bonuses increase by 100%. Overdrive ends when Rafa's action skill ends." },
  "esgrimidor":    { character: "Rafa", description: "Melee attacks gain +10% critical hit chance. Critical hits with Melee restore 5% of Action Skill Duration." },
  "filántropo":    { character: "Rafa", description: "Retriggering Rafa's action skill spawns a free grenade based on the equipped grenade. 4-second cooldown." },
  "filantropo":    { character: "Rafa", description: "Retriggering Rafa's action skill spawns a free grenade based on the equipped grenade. 4-second cooldown." },
  "grenazerker":   { character: "Rafa", description: "Whenever Rafa throws a grenade or a Tediore gun, an additional one is thrown automatically." },
  "instigator":    { character: "Rafa", description: "Firing the Peacebreaker Cannon at enemies grants Instigator stacks. Each stack grants +2% Gun Damage." },
  "overdriver":    { character: "Rafa", description: "Rafa gains +15% Gun Damage and +15% Ordnance Damage while walking, scaling with movement speed. Also grants a fixed +20% Move Speed." },

  // ── Vex ───────────────────────────────────────────────────────────────────
  "avatar":            { character: "Vex", description: "Vex and her minions gain increased damage for each active Attunement Skill. Each Attunement also grants damage reduction matching its element type." },
  "illusionist":       { character: "Vex", description: "Specters and Reapers have a chance to spawn as Badasses with increased health and damage. This is guaranteed at least once every 90 seconds." },
  "kindread spirits":  { character: "Vex", description: "Using a Command Skill grants bonus Kinetic Minion Gun Damage for a duration. The Command Skill itself also deals gun damage." },
  "misericorde":       { character: "Vex", description: "Phase Daggers gain a 25% chance to Ricochet. Critical Hits grant a stack of Misery for 20s (+1.4% Skill Damage per stack, up to 50 stacks)." },
  "technomancer":      { character: "Vex", description: "Eldritch Blast deals additional Ordnance damage. Killing enemies or using grenades resets its cooldown." },
  "teen witch":        { character: "Vex", description: "When at max HP, Lifesteal partially applies to shields. When at max Shield, Lifesteal partially grants Overshield." },
  "undead eye":        { character: "Vex", description: "Killing enemies with Sniper Rifles triggers Blood Shot. Critically hitting has a 33% chance to trigger Blood Shot as well." },
};

const CHARACTER_COLORS: Record<string, string> = {
  Amon:    "text-orange-300",
  Harlowe: "text-cyan-300",
  Rafa:    "text-green-300",
  Vex:     "text-purple-300",
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
