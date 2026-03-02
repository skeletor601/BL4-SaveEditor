/**
 * Master Search data helpers – ported from scarlett.html.
 * Row shape matches scarlett: String, ID, Model Name, Part Type, Stats (Level 50, Common), code, category, Weapon Type, etc.
 */

export interface PartRow {
  String?: string;
  ID?: number;
  "Model Name"?: string;
  "Part Type"?: string;
  "Stats (Level 50, Common)"?: string;
  Effects?: string;
  Stats?: string;
  code?: string;
  Code?: string;
  category?: string;
  "Weapon Type"?: string;
  Manufacturer?: string;
  Rarity?: string;
  [key: string]: unknown;
}

/** API PartItem shape from backend */
export interface ApiPartItem {
  code: string;
  itemType: string;
  rarity?: string;
  partName: string;
  effect?: string;
  category?: string;
  manufacturer?: string;
  partType?: string;
  id?: number;
}

function getStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/** Map API response item to PartRow for Master Search. Accepts camelCase, snake_case, or other keys. Includes rarity and all fields so blob() can search (e.g. "legendary", "enhancement"). */
export function apiItemToPartRow(item: ApiPartItem | Record<string, unknown>): PartRow {
  const raw = item as Record<string, unknown>;
  const partName = getStr(raw, "partName", "part_name", "Part Name", "String");
  const itemType = getStr(raw, "itemType", "item_type", "Item Type", "Model Name", "model_name");
  const partType = getStr(raw, "partType", "part_type", "Part Type");
  const effect = getStr(raw, "effect", "Effect", "Stats (Level 50, Common)", "stats", "Stats");
  const code = getStr(raw, "code", "Code");
  const category = getStr(raw, "category", "Category");
  const rarity = getStr(raw, "rarity", "Rarity");
  const manufacturer = getStr(raw, "manufacturer", "Manufacturer");
  const id = raw.id ?? raw.ID;
  const weaponType = getStr(raw, "weaponType", "Weapon Type", "weapon_type");
  const row: PartRow = {
    String: partName,
    "Model Name": itemType,
    "Part Type": partType || category,
    "Stats (Level 50, Common)": effect,
    code: code || (typeof id === "number" ? `{${id}}` : ""),
    Code: code || (typeof id === "number" ? `{${id}}` : ""),
    category: category || undefined,
    ID: typeof id === "number" ? id : undefined,
    Manufacturer: manufacturer || undefined,
    Rarity: rarity || undefined,
    "Weapon Type": weaponType || undefined,
  };
  for (const [k, v] of Object.entries(raw)) {
    if (k === "_blob" || k === "__hot") continue;
    if (row[k] !== undefined) continue;
    if (v != null && (typeof v === "string" || typeof v === "number")) row[k] = v;
  }
  return row;
}

export const FAV_KEY = "bl4_parts_favorites_v2";

export const RARITY_ORDER: Record<string, number> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  uncommon: 3,
  common: 4,
};

export const LEG_NAMES = [
  "Aegon's Dream", "Bloody Lumberjack", "Bonnie and Clyde", "Bugbear", "Chuck", "Cold Shoulder",
  "Divided Focus", "First Impression", "G.M.R", "Goalkeeper", "Lucian's Flank", "Murmur", "Oscar Mike",
  "Potato Thrower IV", "Rowan's Charge", "Rowdy Rider", "Star Helix", "Whiskey Foxtrot", "Wombo Combo",
  "Budget Deity", "Bully", "Hardpoint", "Inscriber", "King's Gambit", "Lucky Clover", "Noisy Cricket",
  "Phantom Flame", "Queen's Rest", "Rangefinder", "Roach", "Ruby's Grasp", "San Saba Songbird",
  "Seventh Sense", "Sideshow", "Zipper", "Acey May", "Anarchy", "Bod", "Convergence", "Forsaken Chaos",
  "Golden God", "Goremaster", "Hellwalker", "Hot Slugger", "Husky Friend", "Kaleidosplode", "Kickballer",
  "Lead Balloon", "Linebacker", "Mantra", "Missilaser", "Rainbow Vomit", "Sweet Embrace", "T.K's Wave",
  "Sure Shot", "Trauma Bond", "Short Circuit", "Furnace", "Blacksmith", "Shatterwight",
];

function norm(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

const LEG_SET = new Set(LEG_NAMES.map((n) => norm(n)).filter(Boolean));

export function getRowKey(row: PartRow): string {
  const s = (row["String"] ?? row.String ?? "").toString().trim();
  if (s) return s;
  const id = (row["ID"] != null ? row["ID"] : (row as PartRow).ID != null ? (row as PartRow).ID : "").toString().trim();
  if (id) return "id:" + id;
  return JSON.stringify(row);
}

export function isLegendaryByName(row: PartRow): boolean {
  const n = norm((row["Model Name"] ?? (row as PartRow).name ?? (row as PartRow).title ?? "").toString());
  if (!n) return false;
  if (LEG_SET.has(n)) return true;
  for (const it of LEG_SET) {
    if (n.includes(it) || it.includes(n)) return true;
  }
  return false;
}

export function inferRarity(row: PartRow): string {
  const h = (
    (row["Model Name"] ?? "") + " " +
    (row["Part Type"] ?? "") + " " +
    (row["Stats (Level 50, Common)"] ?? "") + " " +
    (row["String"] ?? "") + " " +
    (row.Stats ?? "")
  ).toLowerCase();
  if (isLegendaryByName(row)) return "legendary";
  if (h.includes("legendary")) return "legendary";
  if (h.includes("epic")) return "epic";
  if (h.includes("rare")) return "rare";
  if (h.includes("uncommon")) return "uncommon";
  if (h.includes("common")) return "common";
  return "";
}

export function deriveCategory(row: PartRow): string {
  const wt = (row["Weapon Type"] ?? "").toString().toLowerCase();
  const pt = (row["Part Type"] ?? "").toString().toLowerCase();
  const cat = (row.category ?? "").toString().toLowerCase();
  if (cat.includes("class mod")) return "Class Mod";
  if (cat.includes("enhancement") || pt.includes("enhancement")) return "Enhancement";
  if (cat.includes("shield") || pt.includes("shield")) return "Shield";
  if (cat.includes("grenade") || pt.includes("grenade")) return "Grenade";
  if (cat.includes("repkit") || pt.includes("repkit")) return "Repkit";
  if (/heavy|launcher|ordnance/.test(wt) || pt.includes("heavy")) return "Heavy";
  if (/assault|rifle|pistol|smg|shotgun|sniper/.test(wt) || wt) return "Weapon";
  return "";
}

export function getCode(row: PartRow): string {
  const code = (row.code ?? row.Code ?? "").toString().trim();
  if (code) return code;
  const id = row["ID"];
  return id != null ? `{${id}}` : "—";
}

export function getPartName(row: PartRow): string {
  const name = (row["String"] ?? row["Model Name"] ?? (row as PartRow).String ?? "").toString().trim() || "—";
  const pt = (row["Part Type"] ?? "").toString().trim().toLowerCase();
  if (pt === "rarity") return name + " Skin";
  return name;
}

export function getEffect(row: PartRow): string {
  return (row["Stats (Level 50, Common)"] ?? row["Effects"] ?? row.Stats ?? "").toString().trim() || "—";
}

export function getManufacturer(row: PartRow): string {
  return (row.Manufacturer ?? "").toString().trim();
}

export function blob(row: PartRow): string {
  if ((row as PartRow & { _blob?: string })._blob) return (row as PartRow & { _blob: string })._blob;
  const parts: string[] = [];
  for (const k of Object.keys(row)) {
    if (k === "_blob" || k === "__hot") continue;
    const v = row[k];
    if (v != null && String(v).trim()) parts.push(String(v));
  }
  const pt = (row["Part Type"] ?? "").toString().trim().toLowerCase();
  if (pt === "rarity") parts.push("skin");
  (row as PartRow & { _blob?: string })._blob = parts.join(" ").toLowerCase();
  return (row as PartRow & { _blob: string })._blob;
}

/** Parse code like {33:22} or {33} into { prefix, part }. */
export function parseCode(codeStr: string): { prefix: number; part: number } | null {
  const s = (codeStr ?? "").toString().trim();
  const two = s.match(/^\s*\{\s*(\d+)\s*:\s*(\d+)\s*\}\s*$/);
  if (two) return { prefix: parseInt(two[1], 10), part: parseInt(two[2], 10) };
  const one = s.match(/^\s*\{\s*(\d+)\s*\}\s*$/);
  if (one) {
    const n = parseInt(one[1], 10);
    return { prefix: n, part: n };
  }
  return null;
}

/** Build BL modding format: {xx:[yy yy yy ...]} with part repeated qty times. */
export function buildCopyFormat(prefix: number, part: number, qty: number): string {
  const q = Math.max(1, Math.min(999, qty));
  const parts = Array(q).fill(part);
  return `{${prefix}:[${parts.join(" ")}]}`;
}

export function loadFavorites(): Set<string> {
  try {
    const r = localStorage.getItem(FAV_KEY);
    if (!r) return new Set();
    return new Set(JSON.parse(r) as string[]);
  } catch {
    return new Set();
  }
}

export function saveFavorites(set: Set<string>): void {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}
