import type { PartRow } from "./partsData";

/**
 * Sample parts data – no backend. Matches scarlett row shape.
 */
export const SAMPLE_PARTS: PartRow[] = [
  {
    "String": "ATL_Enhancement.part_core_atl_sureshot",
    "ID": 284,
    "Model Name": "Sure Shot",
    "Part Type": "Enhancement",
    "Stats (Level 50, Common)": "Projectiles from Guns with Atlas-licensed parts automatically attach a Tracker Dart every 25s",
    code: "{284:1}",
    category: "Enhancement",
  },
  {
    "String": "BOR_Enhancement.part_core_bor_traumabond",
    "ID": 296,
    "Model Name": "Trauma Bond",
    "Part Type": "Enhancement",
    "Stats (Level 50, Common)": "After Reloading an empty Magazine, Guns with Ripper-licensed parts have a 30% Chance to increase the next Magazine's Fire Rate +100%",
    code: "{296:11}",
    category: "Enhancement",
  },
  {
    "String": "BOR_Enhancement.part_core_bor_shortcircuit",
    "ID": 296,
    "Model Name": "Short Circuit",
    "Part Type": "Enhancement",
    "Stats (Level 50, Common)": "Short Circuit effect description.",
    code: "{296:12}",
    category: "Enhancement",
  },
  {
    "String": "DAD_Weapon.part_pistol_bonn91",
    "ID": 55,
    "Model Name": "Bonn 91",
    "Part Type": "Body",
    "Stats (Level 50, Common)": "Daedalus Pistol body.",
    code: "{55:2}",
    category: "Weapon",
    "Weapon Type": "Pistol",
  },
  {
    "String": "ATL_ClassMod.Furnace",
    "Model Name": "Furnace",
    "Part Type": "Class Mod",
    "Stats (Level 50, Common)": "Class mod effect.",
    code: "{255:0}",
    category: "Class Mod",
  },
  {
    "String": "MAL_Grenade.part_core",
    "Model Name": "Maliwan Grenade",
    "Part Type": "Grenade",
    "Stats (Level 50, Common)": "Grenades stick to enemies.",
    code: "{263:0}",
    category: "Grenade",
  },
];
