export interface ChangeLogEntry {
  date: string;
  items: string[];
}

export const CHANGE_LOG: ChangeLogEntry[] = [
  {
    date: "2026-03-22",
    items: [
      "COMPLETE WEAPON GENERATOR OVERHAUL — Recipe-driven system learned from 33 real modded weapons. 20 underbarrel recipes with synergistic companion parts. Every gun is truly unique — different underbarrel, different cross-inserts, different damage profile.",
      "51 grenade reload recipes — Artillery Barrage, Missile Storm, Ricochet Barrage, Sustained Fire, Artillery Swarm, Maglock Artillery and more. Spectacular visual effects on every reload.",
      "Shield cross-inserts fixed — no more green element override. Uses legendary shield perks (Wings of Grace, Bininu, Psychosis, etc.) + universal perks.",
      "DPS Estimator recalibrated — additive 3% per damage stack, scans ALL barrels in the weapon. Much closer to in-game values.",
      "Backpack naming — weapons now display the correct barrel name (Lead Balloon, Convergence, etc.) matching in-game. Scans grouped tokens and extracts clean names.",
      "Claude's Gun v2 (1/100) — Space Laser alt-fire, Thought Storm grenade reload, Wings of Grace shield, Daedalus Accelerator, curated companion recipe.",
      "Auto-fill fixes — never picks 'None' parts, no foregrip before underbarrel (was killing alt-fire), Tediore Reload + Jakobs Ricochet forced on manufacturer parts, Torgue Sticky/Impact blacklisted.",
      "Header/base prefix mismatch fixed — gun type always matches its stock parts now.",
      "Easter egg fart sound — every new discovery plays an audio cue. All 69 found = Rick Roll.",
      "Discord server + webhook notifications for feedback.",
      "Modded Grenade Generator overhaul — stripped cross-insert bloat, ONE combined {245} perk block with visual perks first. 68 visual recipes including Inferno, Golden Ring, Green Monster, and Apocalypse variants.",
      "Grenade power modes: Stable/OP/Insane selector added. Overflow+Express stay consistent, Explosive+recipe perks scale with mode.",
      "Damage reduction shield perk on every grenade so they don't kill you.",
      "Pearl rarity on every 10th grenade.",
      "Tediore Enhancement Divider (10 stacks) on every weapon with grenade reload.",
      "Countermeasure grenade added to database (Torgue legendary).",
      "Backpack naming for grenades — shows legendary perk name instead of just manufacturer.",
      "Sort backpack script (scripts/sort_backpack.js) — decrypt save, group items by flag (Favorite/Normal/Junk).",
    ],
  },
  {
    date: "2026-03-21",
    items: [
      "Modded Weapon Generator variety overhaul — every gun now gets a random skin (shiny skins collapsed to 1 slot, Ultimate Shiny gets its own), a random primary element (Corrosive/Cryo/Fire/Radiation/Shock), and visual barrel ordering fixed so barrel visuals actually show.",
      "44 grenade reload recipes (was 24) — 20 new recipes across Singularity, Artillery, Lingering, MIRV, and Hybrid styles. Random grenade element per gun. Airstrike firmware added to the pool.",
      "Community Seed Badges — register your seed + display name, get a colorful gradient name badge on every code you share. 10 badge colors, deterministic by seed.",
      "God Rolls page (/god-rolls) — 70 built-in non-modded god rolls + community submissions. Filter by category (Weapon, Shield, Grenade, Class Mod, Repkit, Enhancement, Heavy). Upvotes and author badges.",
      "Weekly Champion on dashboard — top community code spotlight now shows author badge and votes.",
      "Builder architecture upgrade — manually entered codes now stay exactly where you put them. UI dropdown adds/removes no longer rearrange your codes. Works across all 7 builders.",
      "Grenade estimate panel moved above the builder UI with proper styled container (matches weapon DPS panel).",
    ],
  },
  {
    date: "2026-03-18",
    items: [
      "New app layout mockup at /test-app — sidebar nav, Gear Lab, Arsenal, Command Center, The Vault.",
      "Modded Grenade Generator — auto-fill stock base, 24 visual recipes, cross-category parts (shield, enhancement, class mod, heavy).",
      "Claude's Gun Easter egg (1/20) — Thought Storm recipe, Radiation Convergence, Deadeye firmware.",
      "Claude's Grenade Easter egg (1/20) — Context Window recipe, all 5 Lingering elements + Singularity cascade.",
      "Master Search Easter eggs — search 'chatgpt', 'cursor', or 'claude' for hidden entries.",
      "1/50 rivalry jokes in weapon generator status bar.",
    ],
  },
  {
    date: "2026-03-18",
    items: [
      "Modded Weapon Generator overhaul — stock base via auto-fill for 100% spawn rate.",
      "Visual barrel stacking 2-4x (Terra's pattern). Heavy barrel accessories on ALL guns.",
      "Removed bloat: extreme same-prefix stacking and body x10 repeats.",
      "Tighter MIRV token {289:[17 16 17]} matching Terra's exact pattern.",
      "Every gun guaranteed non-kinetic element (Shock/Radiation/Corrosive/Cryo/Fire).",
      "Always Legendary or Pearl rarity on generated weapons.",
      "Grenade firmware whitelist: Deadeye, Get Throwin', Gadget Ahoy, High Caliber, Daed-dy O' (max 3 stacks).",
      "Overflow and Express perks permanently blocked from grenade reload blocks.",
    ],
  },
  {
    date: "2026-03-18",
    items: [
      "17 new grenade visual recipes (24 total): Singularity Storm, Artillery Barrage, Lingering Inferno, Black Hole, Rain of Fire, Vortex Cannon, Beam Splitter, Neutron Star, Blade Dancer, Gravity Well, Carpet Bomb, Elemental Cascade, MIRV Madness, Death Blossom, Event Horizon, Hailstorm, Supernova.",
      "Visual barrel pool cleanup — removed 10 non-visual barrels + 3 MIRV entries (barrel accessories, not barrels).",
    ],
  },
  {
    date: "2026-03-18",
    items: [
      "Enhancement perk hover cards — descriptions shown on hover for selected parts in the enhancement builder.",
      "Class mod name hover cards — old PartHoverCard suppressed, only ClassModNameHoverCard shown for Name/Legendary names.",
    ],
  },
  {
    date: "2026-03-15",
    items: [
      "Major web overhaul: modded weapon generator, grenade recipe system, parts database, UI polish.",
      "Grenade perk order visualizer — type-245 tokens preserve order, up/down arrows to reorder.",
      "Visual Recipe Builder panel — load curated grenade visual recipes into the builder.",
      "Item Comparison side-by-side — compare two items with yellow highlights for unique parts.",
      "Save Comparison page at /save-compare — diff two YAML save files.",
      "Community Recipe Vault at /community — browse, share, upvote codes.",
      "Recent Codes History — localStorage panel with last 20 codes, copy/load/delete/label.",
    ],
  },
  {
    date: "2026-03-12",
    items: [
      "Class mod name hover cards with descriptions for Elementalist, Dancer, Teen Witch, etc.",
      "Artilleria accent fix — JSON name updated to match Skills.csv diacritic.",
      "Auto-fill fix — Legendary type validation with manufacturer suffix handling.",
    ],
  },
  {
    date: "2026-03-07",
    items: [
      "Master Search filters stabilized (strict part type / rarity / manufacturer behavior).",
      "Canonical DB fields added for cleaner filtering (manufacturer, part type, rarity).",
      "Credits updated with YNOT, Terra, Spliff and Shaggy.",
    ],
  },
  {
    date: "2026-03-01",
    items: [
      "Added Change Gear Level for backpack items (bulk level set).",
      "Added Master Search row copy flow with quantity formatting.",
      "Improved API error messaging for service unavailable scenarios.",
    ],
  },
];
