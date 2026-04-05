export interface ChangeLogEntry {
  date: string;
  items: string[];
}

export const CHANGE_LOG: ChangeLogEntry[] = [
  {
    date: "2026-04-05",
    items: [
      "BUILD FROM URL — Paste a Maxroll, Mobalytics, or YouTube build guide link and get fully assembled gear codes. Godroll priority: weapons use optimal part templates from godrolls.json. Crit knife auto-detected and output as full modded version. Bod 'All Rounder' enhancement rule: all weapon type damage perks applied simultaneously.",
      "YOUTUBE INTEGRATION — Auto-detects Maxroll/Mobalytics planner links in video descriptions. If no link found, extracts build info from video transcript via residential proxy. Warning shown for transcript-only builds.",
      "MAXROLL ASSEMBLER — One-shot scrape + assemble via structured JSON. Maps legendaryId, augmentIds, firmwareId directly to universal parts DB. Cross-mfg enhancement perks from all weapons in the build.",
      "GRENADE STYLE FILTER — Choose Singularity, MIRV, Artillery, or Lingering style for weapon and grenade modded generators. Hybridization sprinkles complementary visual effects. Available on both desktop and mobile.",
      "MOBILE BUILD FROM URL — Paste any build planner link on mobile, get all gear codes with 'Copy All Codes' to clipboard. YouTube auto-detect included.",
      "MOBILE WEAPON PRESETS — Grenade Reload and Inf Alt Fire toggle presets added to mobile weapon builder modded modal.",
      "C4SH SKILL ICON FIX — All 85 C4SH skills now have correct tree color assignments (blue=Sleight of Hand, red=Cross Fire, green=Cleromancy) verified against NCS skilltrees_data. Icons display with colored backgrounds on desktop and mobile.",
      "REPKIT DATABASE REBUILD — All manufacturer repkit entries rewritten from NCS source data. Legendary rarity rows now show actual item names (War Paint, Pacemaker, Defibrillator, etc.) instead of just 'Legendary'. Full descriptions and internalNames on every entry.",
    ],
  },
  {
    date: "2026-03-31",
    items: [
      "UNIVERSAL DATABASE ENRICHMENT — 92% of all actionable parts now have descriptions, perk names, and red text. Data extracted from NCS Cowbell DLC game files (ui_stat4.json). Enhancement perks, firmware, shields, grenades, repkits, heavies, and weapons all enriched.",
      "Background selector — choose between Stock (themed hex backgrounds), Dark Studio, or Light Studio. Swatches in the header next to theme picker. Persisted across sessions. Settings page also has the full selector.",
      "UI overhaul — deeper background blur, shadow depth on all panels/cards/buttons, stronger button contrast with cyan glow on hover, inset shadows on inputs.",
      "Parts list 'Show Info' button — full-width cyan button on every part card. Click to see perk name, description, manufacturer, rarity, and red text from the enriched database.",
      "Hover card deduplication — no longer shows duplicate text when the effect matches the name or item type.",
      "Class mod universal perks renamed — '+20% Movement Speed' is now 'Movement Speed Class Mod Perk' with the stat as the effect description. Part type is 'Universal Class Mod Perk'.",
      "Parts list right-aligned with ml-auto for better screen usage.",
      "Firmware descriptions added across all gear types (22 firmwares: God Killer, Airstrike, Lifeblood, etc.).",
      "Element descriptions added (Fire, Shock, Cryo, Corrosive, Radiation, Dark, Kinetic, Explosive).",
      "NCS enrichment pipeline — new script (enrich_universal_db.js) reads parsed NCS game data and fills in missing perk descriptions + red text.",
    ],
  },
  {
    date: "2026-03-30",
    items: [
      "Community vault data persistence fix — recipes and profiles now correctly read/write to Render's persistent disk instead of ephemeral storage. All community submissions survive deploys.",
      "Grenade description fix — build_parts_db.js was not reading the Description column from grenade_main_perk_EN.csv. Fixed, grenades went from 43 to 103 entries with effects.",
      "Discord links removed from header and sidebar.",
      "Background image blur and brightness tweaks for better readability.",
    ],
  },
  {
    date: "2026-03-29",
    items: [
      "NCS Data Tool — full binary parser, comparison engine, and automated extractor all passing tests. 599 weapons, 112 shields, 63 repkits, 69 heavies extracted from post-DLC data.",
      "Universal DB conversion complete — all 8 API builders (weapon, grenade, shield, repkit, heavy, enhancement, class mod, accessory edit) now read from universal_parts_db.json.",
      "ncs_pipeline.py writes directly to universal_parts_db.json — no more feeder CSVs in the pipeline.",
      "parts.ts normalizes all 15 fields with smart itemType resolution (rarity tiers, barrel names from descriptions).",
    ],
  },
  {
    date: "2026-03-28",
    items: [
      "Interactive badge editor for weapon builder — all 6 badge features live (manufacturer, weapon type, rarity, element, DPS estimate, barrel name).",
      "Translator multi-line parsing fix and rarity dropdown cleanup.",
      "Element category labels added to Master Search filters.",
    ],
  },
  {
    date: "2026-03-27",
    items: [
      "DLC COWBELL UPDATE — New playable character C4SH (Rogue) fully integrated into the class mod builder. 100 skills across 3 trees (Sleight of Hand, Crossfire, Cleromancy) with all 5-tier skill IDs, descriptions, and color-tinted icons.",
      "34 new DLC legendary weapons added — Mantra, Shalashaska, Roulette, Eigenburst, Flash Cyclone, Inscriber, Jetsetter, Doeshot, Mercredi, Fleabag, Handcannon, Bubbles, Mercurious, Conflux, and more across all manufacturers.",
      "6 Pearlescent rarity weapons identified and properly tagged — Conflux, Eigenburst, Handcannon, Crazed Earl, Crow-Sourced, Soul Survivor. Pearl option now shows in rarity dropdown for those weapon types.",
      "New legendary shields — Honey Badger (Daedalus), Elpis Star (Maliwan), Hopscotch (Tediore), Undershield (Vladof).",
      "New legendary grenades — Barb'ara (Vladof), Bismuth-Tipped Dagger (Jakobs), Sho Kunai (Jakobs), Skully (Order), Urchin (Tediore), Slippy (Torgue), Flare (Torgue).",
      "New legendary repkits — Healthraiser (Daedalus), Blood Moon (Order), Geiger-Roid (Maliwan).",
      "New firmware — Skillcraft (Raid DLC).",
      "Custom Modded Grenade Generator — same as custom weapon generator. Pick manufacturer and legendary, mods added on top. Random or custom mode via modal.",
      "Max All Skills button moved to top row in class mod builder next to Add Other Parts.",
      "Weapon parts now included in universal parts database — Master Search covers all 5,680 parts including weapons, elementals, shields, grenades, repkits, enhancements, class mods, and heavies.",
      "Build script updated to pull from weapon_edit CSVs + elemental.csv. All parts flow into parts.json and universal_parts_db.json.",
      "Backpack button moved into Character Studio top tab bar (alongside Select Save, Character, YAML).",
      "Overwrite Save in Character Studio now writes to game folder instead of Downloads (uses same file handle system as unified builder).",
      "Dockerfile fixed for renamed Python files (codec/, save_ops.py, etc.).",
      "New DLC class mods for existing characters — Lamplighter (Amon), Trooper (Harlowe), Overdriver (Rafa), Misericorde (Vex).",
    ],
  },
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
