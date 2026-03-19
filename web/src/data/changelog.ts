export interface ChangeLogEntry {
  date: string;
  items: string[];
}

export const CHANGE_LOG: ChangeLogEntry[] = [
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
