/**
 * Build-from-URL V2: scrape Mobalytics build guides with FULL context —
 * variants, firmware, skills, equipment text — then resolve names and
 * assemble stock items that match the guide's recommendations.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

// ── Types ───────────────────────────────────────────────────────────────────

export interface MobaGearSlot {
  slot: string;
  title: string;
  type: string;
  slug: string;
  iconUrl?: string;
}

export interface MobaSkillAlloc {
  slug: string;
  level: number;
}

export interface MobaVariant {
  id: string;
  name: string;
  gear: MobaGearSlot[];
  firmware: MobaGearSlot[];
  enhancement: MobaGearSlot | null;
  specializations: MobaGearSlot[];
  skillTree: {
    actionSkill: string;
    capstone: string;
    augments: string[];
    skills: MobaSkillAlloc[];
  } | null;
}

/** Parsed context from the build guide text */
export interface BuildContext {
  /** Per-weapon-slot context clues */
  weaponHints: {
    allElements: boolean;
    dominantElement: string | null;  // e.g. "Radiation" — detected from overview/URL/text
    manufacturerParts: string[];    // e.g. ["Jakobs (Ricochet Accessory)", "Ripper (Charge Mag)"]
    underbarrel: string | null;     // e.g. "Spread Launcher"
    perWeapon: Record<string, { underbarrel?: string; element?: string; mfgParts?: string[] }>;
  };
  /** Class mod skill recommendations: [{name, level}] */
  classModSkills: { name: string; level: number }[];
  /** Enhancement stat preferences */
  enhancementStats: string[];
  /** Enhancement firmware perk names */
  enhancementPerks: string[];
  /** Repkit perk hints parsed from text (e.g. "Amp (Amplified)", "Enrage (Experimental)") */
  repkitPerks: string[];
  /** Ordnance hints (e.g. "Crit Knife" = Jakobs throwing knife + Penetrator) */
  ordnanceHint: string | null;
  /** Firmware recommendation parsed from text */
  firmwareHint: string | null;
  /**
   * Gear items found in the text for categories NOT in the structured gear slots.
   * These are injected into the variant's gear list so the resolver can handle them.
   */
  textDerivedGear: MobaGearSlot[];
  /** Full equipment text (for display) */
  equipmentText: string;
  /** Firmware text */
  firmwareText: string;
}

export interface ScrapedBuild {
  buildName: string;
  character: string;
  url: string;
  variants: MobaVariant[];
  context: BuildContext;
  rawSlotCount: number;
}

export interface ResolvedItem {
  slot: string;
  mobaName: string;
  mobaType: string;
  category: string;
  confidence: "exact" | "fuzzy" | "not_found";
  match?: {
    code: string;
    partName: string;
    partType: string;
    manufacturer: string;
    weaponType?: string;
    rarity: string;
    effect?: string;
    typeId: string;
    partId: string;
  };
  alternatives?: { code: string; partName: string; manufacturer: string; score: number }[];
}

export interface StockItem {
  slot: string;
  category: string;
  itemName: string;
  manufacturer: string;
  weaponType?: string;
  element?: string;
  decoded: string;
  typeId: string;
  confidence: "exact" | "fuzzy" | "not_found";
  notes?: string;
}

export interface AssembledBuild {
  buildName: string;
  character: string;
  variantName: string;
  items: StockItem[];
  skipped: { slot: string; reason: string }[];
}

// ── Universal DB ────────────────────────────────────────────────────────────

interface UniversalRow {
  code: string;
  partName: string;
  internalName?: string;
  itemType: string;
  category: string;
  partType: string;
  manufacturer: string;
  rarity: string;
  effect: string;
  weaponType: string;
  element?: string;
}

let dbCache: UniversalRow[] | null = null;

function loadDb(): UniversalRow[] {
  if (dbCache) return dbCache;
  const path = join(repoRoot, "master_search", "db", "universal_parts_db.json");
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    dbCache = (raw?.rows ?? raw ?? []) as UniversalRow[];
    return dbCache;
  } catch {
    return [];
  }
}

function parseCode(code: string): { typeId: string; partId: string } {
  const m = code.match(/^\{(\d+):(\d+)\}$/);
  return m ? { typeId: m[1], partId: m[2] } : { typeId: "", partId: "" };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[''`]/g, "").replace(/[-]/g, " ").replace(/\s+/g, " ").trim();
}

// ── Mobalytics type → our category ─────────────────────────────────────────

const MOBA_TYPE_MAP: Record<string, string> = {
  weapons: "Weapon",
  shields: "Shield",
  ordnance: "Grenade",
  legendaryRepkits: "Repkit",
  classMods: "Class Mod",
  enhancementPerks: "Enhancement",
};

const SKIP_TYPES = new Set(["firmwarePerks", "specializations"]);

// ── Lexical Text Extraction ─────────────────────────────────────────────────

function extractLexicalText(node: any): string {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  if (node.type === "static-data-widget") return `[${node.label || node.id || ""}]`;
  if (node.type === "linebreak") return "\n";
  if (node.type === "heading") {
    const inner = (node.children || []).map(extractLexicalText).join("");
    return "\n## " + inner + "\n";
  }
  if (node.type === "listitem") {
    const inner = (node.children || []).map(extractLexicalText).join("");
    return "- " + inner;
  }
  if (Array.isArray(node.children)) return node.children.map(extractLexicalText).join("");
  return "";
}

function extractFromLexicalRoot(val: any): string {
  if (!val?.root?.children) return "";
  return val.root.children.map(extractLexicalText).join("\n").trim();
}

// ── Scraper ─────────────────────────────────────────────────────────────────

export async function scrapeMobalyticsBuild(url: string): Promise<ScrapedBuild> {
  if (!url.includes("mobalytics.gg/borderlands-4/builds")) {
    throw new Error("Invalid URL — must be a mobalytics.gg Borderlands 4 build page");
  }

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html",
    },
  });
  if (!resp.ok) throw new Error(`Failed to fetch build page: HTTP ${resp.status}`);
  const html = await resp.text();

  const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!stateMatch) throw new Error("Could not find __PRELOADED_STATE__ in page");

  let state: any;
  try { state = JSON.parse(stateMatch[1]); }
  catch { throw new Error("Failed to parse __PRELOADED_STATE__ JSON"); }

  const graphql = state?.borderlands4State?.apollo?.graphql;
  if (!graphql) throw new Error("No Apollo graphql cache found in state");

  // Find the build document (the one with content + buildVariants)
  const docKeys = Object.keys(graphql).filter(k =>
    k.startsWith("Borderlands4UserGeneratedDocument:")
  );
  if (docKeys.length === 0) throw new Error("No build document found");

  const urlSlug = url.split("/builds/").pop()?.split("?")[0]?.split("#")[0] ?? "";

  let doc: any = null;
  for (const key of docKeys) {
    const d = graphql[key];
    if (d?.content && d?.data?.buildVariants) { doc = d; break; }
  }
  if (!doc) {
    // Fallback: match by slug
    for (const key of docKeys) {
      const d = graphql[key];
      if (d?.slugifiedName?.includes(urlSlug) || d?.data?.buildVariants) { doc = d; break; }
    }
  }
  if (!doc) throw new Error("Could not locate build document");

  const buildName = doc.data?.name || doc.slugifiedName || urlSlug;
  // Extract character from tags
  let character = "";
  if (doc.tags?.data) {
    for (const tag of doc.tags.data) {
      if (tag.groupSlug === "character" && tag.name) { character = tag.name; break; }
    }
  }

  // ── Extract variants ──────────────────────────────────────────────────
  const rawVariants = doc.data?.buildVariants?.values ?? [];
  const variantNames: Record<string, string> = {};
  // Get variant names from the graphql cache
  for (const key of Object.keys(graphql)) {
    if (key.startsWith("NgfDocumentCmWidgetContentVariantsV1DataChildVariant:")) {
      const v = graphql[key];
      if (v?.id && v?.title) variantNames[v.id] = v.title.trim();
    }
  }

  const variants: MobaVariant[] = [];
  for (const rv of rawVariants) {
    if (rv.id === "no-variant-id") continue;
    const slots = rv.genericBuilder?.slots ?? [];
    if (slots.length === 0) continue;

    const gear: MobaGearSlot[] = [];
    const firmware: MobaGearSlot[] = [];
    let enhancement: MobaGearSlot | null = null;
    const specializations: MobaGearSlot[] = [];

    for (const slot of slots) {
      const entity = slot?.gameEntity;
      if (!entity) continue;
      const parsed: MobaGearSlot = {
        slot: slot.gameSlotSlug || "",
        title: entity.title || entity.slug || "",
        type: entity.type || "",
        slug: entity.slug || "",
        iconUrl: entity.iconUrl,
      };

      if (parsed.type === "firmwarePerks") {
        firmware.push(parsed);
      } else if (parsed.type === "specializations") {
        specializations.push(parsed);
      } else if (parsed.type === "enhancementPerks") {
        enhancement = parsed;
      } else if (MOBA_TYPE_MAP[parsed.type]) {
        gear.push(parsed);
      }
    }

    // Skill tree
    let skillTree: MobaVariant["skillTree"] = null;
    if (rv.skillTree) {
      const st = rv.skillTree;
      skillTree = {
        actionSkill: st.actionSkill?.slug || "",
        capstone: st.capstone?.slug || "",
        augments: (st.augment || []).map((a: any) => a?.slug || "").filter(Boolean),
        skills: (st.skills || []).map((s: any) => ({
          slug: s.skill?.slug || s.slug || "",
          level: s.level || 0,
        })),
      };
    }

    variants.push({
      id: rv.id,
      name: variantNames[rv.id] || `Variant ${rv.id}`,
      gear,
      firmware,
      enhancement,
      specializations,
      skillTree,
    });
  }

  // ── Extract ALL text from content blocks ────────────────────────────────
  const content = doc.content || [];
  let equipmentText = "";
  let firmwareText = "";
  let overviewText = "";
  const allTextChunks: string[] = [];

  for (const block of content) {
    const typename = block.__typename || "";
    // Collect text from every block that has it
    const textPaths = [block.data?.description?.value, block.data?.content?.value];
    if (block.data?.groups) {
      for (const g of block.data.groups) textPaths.push(g.description?.value);
    }
    for (const p of textPaths) {
      if (p?.root) {
        const t = extractFromLexicalRoot(p);
        if (t.length > 10) allTextChunks.push(t);
      }
    }

    if (typename === "NgfDocumentUgWidgetBuilderV1") {
      const title = block.data?.title || "";
      const descVal = block.data?.description?.value;
      if (descVal) {
        const text = extractFromLexicalRoot(descVal);
        if (text.length > 50) {
          if (title === "Equipment" && text.length > equipmentText.length) equipmentText = text;
          if (title === "Firmware" && text.length > firmwareText.length) firmwareText = text;
        }
      }
    }
    if (typename.includes("RichTextSimplified") && block.data?.title === "Build Overview") {
      const text = extractFromLexicalRoot(block.data?.content?.value);
      if (text.length > 50) overviewText = text;
      if (!equipmentText) equipmentText = text;
    }
  }

  // Also collect variant descriptions
  for (const key of Object.keys(graphql)) {
    if (key.startsWith("NgfDocumentCmWidgetContentVariantsV1DataChildVariant:")) {
      const v = graphql[key];
      if (v?.description?.value?.root) {
        allTextChunks.push(extractFromLexicalRoot(v.description.value));
      }
    }
  }

  const allText = allTextChunks.join("\n\n");

  // ── Parse context from ALL text ───────────────────────────────────────
  const context = parseEquipmentContext(equipmentText, firmwareText, overviewText, allText, urlSlug);

  // ── Inject text-derived gear into variants where categories are missing ──
  if (context.textDerivedGear.length > 0) {
    for (const variant of variants) {
      const existingSlots = new Set(variant.gear.map(g => g.slot));
      for (const tg of context.textDerivedGear) {
        if (!existingSlots.has(tg.slot)) {
          variant.gear.push(tg);
        }
      }
    }
  }

  return {
    buildName,
    character,
    url,
    variants,
    context,
    rawSlotCount: rawVariants.reduce((sum: number, v: any) =>
      sum + (v.genericBuilder?.slots?.length || 0), 0),
  };
}

// ── Text Context Parser ─────────────────────────────────────────────────────

/**
 * Split the equipment text into named sections by category headers.
 * Handles: "Guns:", "Shield:", "## SHIELD", "REPKIT", "Ordnance:", etc.
 */
function splitTextSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  // Match section headers like "## WEAPONS", "Shield:", "Guns:", "Repkit:", "ENHANCEMENT:"
  // The header can be followed by a newline OR by content on the same line (colon-style)
  const headerRe = /(?:^|\n+)(?:## ?)?\s*(Guns?|Weapons?|Shield|Repkit|Class Mod|Enhancement|Firmware|Ordnance|Licensed Parts|Other Weapons?|Bossing|Mobbing|Stats)\s*:\s*/gi;
  let lastKey = "_intro";
  let lastIdx = 0;
  const matches = [...text.matchAll(headerRe)];
  for (const m of matches) {
    sections[lastKey] = (sections[lastKey] || "") + text.slice(lastIdx, m.index);
    lastKey = m[1].toLowerCase().replace(/s$/, "").trim();
    if (lastKey === "weapon" || lastKey === "gun") lastKey = "weapons";
    if (lastKey === "other weapon") lastKey = "weapons_other";
    if (lastKey === "licensed part") lastKey = "licensed_parts";
    lastIdx = (m.index ?? 0) + m[0].length;
  }
  sections[lastKey] = (sections[lastKey] || "") + text.slice(lastIdx);
  return sections;
}

function parseEquipmentContext(
  equipmentText: string, firmwareText: string,
  overviewText: string = "", allText: string = "", urlSlug: string = "",
): BuildContext {
  const lower = equipmentText.toLowerCase();
  const fullText = equipmentText + "\n" + firmwareText;
  const sections = splitTextSections(fullText);

  // ── Detect dominant element from ALL text ─────────────────────────────
  // Count element word occurrences, ignoring "fire rate", "fire speed", etc.
  const ELEMENT_NAMES = ["fire", "shock", "cryo", "corrosive", "radiation"] as const;
  type ElementName = typeof ELEMENT_NAMES[number];
  const elementCounts: Record<string, number> = {};
  const scanText = (overviewText + "\n" + allText + "\n" + urlSlug).toLowerCase();
  for (const el of ELEMENT_NAMES) {
    if (el === "fire") {
      // Only count standalone "fire" not "fire rate", "fire speed", "firing", "firewerks"
      const fireMatches = scanText.match(/\bfire\b(?!\s*(rate|speed|ing|werk|pot|dancer|wall|walk))/g);
      elementCounts[el] = fireMatches?.length ?? 0;
    } else {
      const re = new RegExp(`\\b${el}\\b`, "g");
      elementCounts[el] = (scanText.match(re) || []).length;
    }
  }
  // Also check URL slug for element names (e.g. "radiation-chroma-harlowe")
  for (const el of ELEMENT_NAMES) {
    if (urlSlug.toLowerCase().includes(el)) elementCounts[el] = (elementCounts[el] || 0) + 5;
  }

  // Determine: if one element dominates (3+ mentions and 2x more than any other), use it for all weapons
  // If "all elemental bases" etc., use all elements
  const allElements = lower.includes("all elemental bases") ||
    lower.includes("cover all element") || lower.includes("all elements");

  let dominantElement: ElementName | null = null;
  if (!allElements) {
    const sorted = Object.entries(elementCounts)
      .filter(([, c]) => c >= 3)
      .sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const [topEl, topCount] = sorted[0];
      const secondCount = sorted[1]?.[1] ?? 0;
      if (topCount >= 3 && topCount >= secondCount * 2) {
        dominantElement = topEl as ElementName;
      }
    }
  }

  // Manufacturer parts: "Jakobs (Ricochet Accessory)", "Ripper (Charge Mag)"
  // Filter out repkit/shield/enhancement perks
  const REPKIT_PERK_NAMES = new Set(["amp", "enrage", "immunity", "chrome", "cardiac", "blood siphon", "heart pump", "time dilation", "blood rush", "pulseometer"]);
  const mfgPartMatches = equipmentText.match(/\[([A-Z][a-z]+ \([^)]+\))\]/g) || [];
  const manufacturerParts: string[] = [];
  const repkitPerks: string[] = [];
  for (const m of mfgPartMatches) {
    const clean = m.replace(/[\[\]]/g, "");
    const firstWord = clean.split(/\s*\(/)[0].trim().toLowerCase();
    if (REPKIT_PERK_NAMES.has(firstWord)) {
      repkitPerks.push(clean);
    } else {
      manufacturerParts.push(clean);
    }
  }

  // Underbarrel detection — parse per-weapon underbarrels
  const UNDERBARREL_NAMES = ["spread launcher", "knife launcher", "zip rockets", "beam tosser",
    "kill drones", "space laser", "harpoon", "gravity well", "meathook"];
  let globalUnderbarrel: string | null = null;
  const perWeapon: Record<string, { underbarrel?: string; element?: string; mfgParts?: string[] }> = {};

  // Scan for patterns like "Spread Launcher [Jakobs Shotgun]" or "[Spread Launcher] on [Jakobs Shotgun]"
  // or "- Spread Launcher [Jakobs Shotgun]"
  for (const ubName of UNDERBARREL_NAMES) {
    const ubTitleCase = ubName.replace(/\b\w/g, c => c.toUpperCase());
    // Pattern: underbarrel name near a weapon name in brackets
    const patterns = [
      new RegExp(`${ubName}\\s*\\[([^\\]]+)\\]`, "gi"),
      new RegExp(`\\[${ubName}\\]\\s*(?:on|for|with)?\\s*\\[([^\\]]+)\\]`, "gi"),
      new RegExp(`\\[([^\\]]+)\\]\\s*(?:with|using)?\\s*(?:the\\s+)?(?:\\[)?${ubName}`, "gi"),
    ];
    let foundPerWeapon = false;
    for (const pat of patterns) {
      for (const m of equipmentText.matchAll(pat)) {
        const weaponName = m[1].trim();
        perWeapon[weaponName] = { ...(perWeapon[weaponName] || {}), underbarrel: ubTitleCase };
        foundPerWeapon = true;
      }
    }
    // If found globally but not per-weapon, set as global
    if (!foundPerWeapon && lower.includes(ubName)) {
      if (!globalUnderbarrel) globalUnderbarrel = ubTitleCase;
    }
  }

  // Also check "X underbarrel" pattern
  if (!globalUnderbarrel && Object.keys(perWeapon).length === 0) {
    const ubMatch = lower.match(/(\w+)\s+(?:shotgun\s+)?underbarrel/);
    if (ubMatch) globalUnderbarrel = "Spread Launcher";
  }

  // ── Class mod skills ──────────────────────────────────────────────────
  const classModSkills: { name: string; level: number }[] = [];
  const FIRMWARE_NAMES = new Set(["skillcraft", "high caliber", "reel big fist", "reel big", "heating up",
    "goojfc", "action fist", "bullets to spare", "deadeye"]);
  const skillMatches = equipmentText.matchAll(/\+(\d)\s*(?:into\s+)?\[([^\]]+)\]/g);
  for (const sm of skillMatches) {
    const name = sm[2].trim();
    const level = parseInt(sm[1]);
    if (level >= 1 && level <= 5 && !FIRMWARE_NAMES.has(name.toLowerCase())) {
      classModSkills.push({ name, level });
    }
  }

  // ── Enhancement stats ─────────────────────────────────────────────────
  const enhancementStats: string[] = [];
  const enhText = sections["enhancement"] || "";
  const statSection = (sections["stat"] || "") + "\n" + enhText;

  // Match "Gun Damage", "Gun Crit Damage", "Shotgun Mag Size", etc.
  const statMatches = statSection.match(/(Shotgun|Gun|Weapon|Melee|Skill|Sniper|SMG|Splash|Pistol|Assault Rifle|AR)\s+(Type\s+)?(Damage|Crit Damage|Crit|Mag Size|Magazine Size|Equip Speed|Fire Rate|Reload Speed|Splash Radius|damage)/gi);
  if (statMatches) {
    for (const s of statMatches) enhancementStats.push(s.trim());
  }

  // Also parse line-by-line stat recommendations (common in build guides)
  // Lines that are just stat names: "Gun Damage", "Gun Type Damage", etc.
  const lines = statSection.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Match standalone stat lines (not inside longer sentences)
    if (trimmed.length > 5 && trimmed.length < 40 && !trimmed.startsWith("-") && !trimmed.startsWith("#")) {
      const statLine = trimmed.match(/^(Gun|Shotgun|Pistol|Sniper|SMG|AR|Assault Rifle|Melee|Skill|Weapon)\s+(Type\s+)?(Damage|Crit Damage|Splash Radius|Type Splash Radius|Equip Speed|Fire Rate|Reload Speed|Mag Size)$/i);
      if (statLine && !enhancementStats.some(s => normalize(s) === normalize(trimmed))) {
        enhancementStats.push(trimmed);
      }
    }
  }

  // ── Enhancement perks ─────────────────────────────────────────────────
  const enhancementPerks: string[] = [];
  const MFG_NAMES = new Set(["jakobs", "ripper", "maliwan", "torgue", "vladof", "tediore", "daedalus", "order",
    "atlas", "cov", "hyperion", "enhancement"]);
  if (enhText) {
    // Look for named perks: "Bounce Pass", "[Quintain]", "Piercer"
    const perkCandidates = enhText.match(/(?:\[([^\]]+)\]|(?:^|\s)(Bounce Pass|Piercer|Multistrike|Sequencer|Entropic|Devourer|Hard Charger|Free Loader|Short Circuit|Lame|Mixologist|Bullet Hose))/gi);
    if (perkCandidates) {
      for (const p of perkCandidates) {
        const name = p.replace(/[\[\]]/g, "").trim();
        if (name && !MFG_NAMES.has(name.toLowerCase())) enhancementPerks.push(name);
      }
    }
  }

  // ── Ordnance ──────────────────────────────────────────────────────────
  let ordnanceHint: string | null = null;
  const ordText = sections["ordnance"] || "";
  if (lower.includes("crit knife") || lower.includes("penetrator augment knife") ||
      lower.includes("penetrator augment") || lower.includes("throwing knife")) {
    ordnanceHint = "Penetrator Knife";
  }

  // ── Firmware from text ────────────────────────────────────────────────
  let firmwareHint: string | null = null;
  // Try section, then separate firmware text, then scan the full equipment text
  const fwText = sections["firmware"] || firmwareText || "";
  const fwScanText = fwText || equipmentText;
  // Find firmware section in the full text as fallback
  const fwSectionMatch = fwScanText.match(/Firmware:?\s*([\s\S]*?)(?=\n(?:Ordnance|Shield|Repkit|Enhancement|Class Mod|Guns?|Bossing|Mobbing|\n##)|$)/i);
  const fwContent = fwSectionMatch ? fwSectionMatch[1] : fwText;
  if (fwContent) {
    const fwMatches = fwContent.matchAll(/(\d)\s*(?:\/\d\s*)?(?:pc\s*)?\[([^\]]+)\]/g);
    const fwParts: string[] = [];
    for (const fm of fwMatches) {
      fwParts.push(`${fm[1]}x ${fm[2]}`);
    }
    if (fwParts.length > 0) firmwareHint = fwParts.join(", ");
  }

  // ── Text-derived gear: extract items for missing categories ───────────
  const textDerivedGear: MobaGearSlot[] = [];

  // Shield: "My preferred shield is [X]" or first [X] in Shield section
  const shieldText = sections["shield"] || "";
  if (shieldText) {
    const preferredMatch = shieldText.match(/preferred\s+(?:shield\s+)?(?:is\s+)?\[([^\]]+)\]/i);
    const firstShieldMatch = shieldText.match(/\[([^\]]+)\]/);
    const shieldName = preferredMatch?.[1] || firstShieldMatch?.[1];
    if (shieldName) {
      textDerivedGear.push({ slot: "shield", title: shieldName.trim(), type: "shields", slug: shieldName.toLowerCase().replace(/\s+/g, "-") });
    }
  }

  // Repkit: first mentioned in Repkit section
  const repkitText = sections["repkit"] || "";
  if (repkitText) {
    const repkitMatch = repkitText.match(/\[([^\]]+)\]/);
    if (repkitMatch) {
      textDerivedGear.push({ slot: "repkit", title: repkitMatch[1].trim(), type: "legendaryRepkits", slug: repkitMatch[1].toLowerCase().replace(/\s+/g, "-") });
    }
  }

  // Ordnance: if we detected a hint, create a Jakobs Grenade for "Penetrator Knife"
  if (ordnanceHint && !sections["ordnance"]?.match(/\[([^\]]+)\]/)) {
    // "Penetrator knife" = Jakobs Grenade with Penetrator augment
    textDerivedGear.push({ slot: "ordnance", title: "Jakobs Grenade", type: "ordnance", slug: "jakobs-grenade" });
  } else if (sections["ordnance"]) {
    const ordMatch = sections["ordnance"].match(/\[([^\]]+)\]/);
    if (ordMatch) {
      textDerivedGear.push({ slot: "ordnance", title: ordMatch[1].trim(), type: "ordnance", slug: ordMatch[1].toLowerCase().replace(/\s+/g, "-") });
    }
  }

  return {
    weaponHints: { allElements, dominantElement, manufacturerParts, underbarrel: globalUnderbarrel, perWeapon },
    classModSkills,
    enhancementStats,
    enhancementPerks,
    repkitPerks,
    ordnanceHint,
    firmwareHint,
    textDerivedGear,
    equipmentText,
    firmwareText,
  };
}

// ── Name Resolver ───────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function getSearchableNames(row: UniversalRow): string[] {
  const names: string[] = [];
  if (row.category === "Weapon") {
    if (row.partType === "Rarity" && row.partName) names.push(row.partName);
  } else if (row.category === "Shield" || row.category === "Grenade" || row.category === "Repkit") {
    if (row.partType === "Rarity" && row.effect) {
      names.push(row.effect.replace(/\s*skin\s*$/i, "").trim());
    }
    if (row.partType === "Legendary Perk" && row.partName) {
      names.push(row.partName);
    }
  } else if (row.category === "Class Mod") {
    if (row.partType === "Name" && row.partName) names.push(row.partName);
  }
  return names;
}

export function resolveItems(gear: MobaGearSlot[], equipmentText: string = ""): ResolvedItem[] {
  const db = loadDb();
  const results: ResolvedItem[] = [];

  for (const slot of gear) {
    const category = MOBA_TYPE_MAP[slot.type];
    if (!category) continue;

    let mobaName = slot.title;

    // If the slot name is generic (e.g. "Vladof SMG", "Jakobs Shotgun"), look in the
    // equipment text for a specific legendary name mentioned nearby.
    const MANUFACTURERS_SET = new Set(["atlas", "cov", "daedalus", "hyperion", "jakobs", "maliwan", "order", "ripper", "tediore", "torgue", "vladof"]);
    const nameWords = mobaName.toLowerCase().split(/\s+/);
    const hasMfg = nameWords.some(w => MANUFACTURERS_SET.has(w));
    const hasGenericType = nameWords.some(w => ["smg", "shotgun", "pistol", "sniper", "assault", "grenade", "shield", "repkit", "enhancement"].includes(w));
    if (hasMfg && hasGenericType && equipmentText && category === "Weapon") {
      // Find [ItemName] references in the text that are weapon legendaries for this manufacturer
      const mfgWord = nameWords.find(w => MANUFACTURERS_SET.has(w))!;
      const weaponLegendaries = db.filter(r =>
        r.category === "Weapon" && r.partType === "Rarity" &&
        (r.rarity === "Legendary" || r.rarity === "Pearl") &&
        r.manufacturer?.toLowerCase() === mfgWord
      );
      // Check which legendary names appear as [Name] in the text
      for (const leg of weaponLegendaries) {
        if (leg.partName && equipmentText.includes(`[${leg.partName}]`)) {
          // Check it's not already used by another gear slot
          const alreadyUsed = gear.some(g => g !== slot && normalize(g.title) === normalize(leg.partName));
          if (!alreadyUsed) {
            mobaName = leg.partName;
            break;
          }
        }
      }
    }

    const normName = normalize(mobaName);

    // Filter DB to matching category and legendary/pearl rows
    const candidates = db.filter(r => {
      if (r.category !== category) return false;
      if (category === "Weapon") return r.partType === "Rarity" && (r.rarity === "Legendary" || r.rarity === "Pearl");
      if (category === "Shield" || category === "Grenade" || category === "Repkit") {
        return (r.partType === "Rarity" && r.rarity === "Legendary") || r.partType === "Legendary Perk";
      }
      if (category === "Class Mod") return r.partType === "Name" && r.rarity === "Legendary";
      return false;
    });

    // Score candidates
    const scored: { row: UniversalRow; score: number; matchedName: string }[] = [];
    for (const row of candidates) {
      for (const sn of getSearchableNames(row)) {
        const normSn = normalize(sn);
        let score = Infinity;
        if (normSn === normName) score = 0;
        else if (normSn.includes(normName) || normName.includes(normSn))
          score = 1 + Math.abs(normSn.length - normName.length);
        else {
          const d = levenshtein(normSn, normName);
          if (d < Math.max(normSn.length, normName.length) * 0.4) score = 10 + d;
        }
        if (score < Infinity) scored.push({ row, score, matchedName: sn });
      }
    }
    scored.sort((a, b) => a.score - b.score);

    if (scored.length > 0 && scored[0].score <= 15) {
      const best = scored[0];
      const { typeId, partId } = parseCode(best.row.code);
      results.push({
        slot: slot.slot, mobaName, mobaType: slot.type, category,
        confidence: best.score <= 2 ? (best.score === 0 ? "exact" : "fuzzy") : "fuzzy",
        match: {
          code: best.row.code, partName: best.matchedName, partType: best.row.partType,
          manufacturer: best.row.manufacturer, weaponType: best.row.weaponType || undefined,
          rarity: best.row.rarity, effect: best.row.effect || undefined, typeId, partId,
        },
        alternatives: scored.slice(1, 4).map(s => ({
          code: s.row.code, partName: s.matchedName, manufacturer: s.row.manufacturer, score: s.score,
        })),
      });
    } else {
      // Fallback: generic manufacturer legendary
      const MANUFACTURERS = ["atlas", "cov", "daedalus", "hyperion", "jakobs", "maliwan", "order", "ripper", "tediore", "torgue", "vladof"];
      const WEAPON_TYPES = ["pistol", "shotgun", "smg", "sniper", "assault rifle", "assault", "heavy"];
      const normWords = normName.split(" ");
      const mfgWord = normWords.find(w => MANUFACTURERS.includes(w));
      if (mfgWord) {
        const mfgName = mfgWord.charAt(0).toUpperCase() + mfgWord.slice(1);
        const weaponTypeWord = normWords.find(w => WEAPON_TYPES.includes(w));
        let legendaryRow: UniversalRow | undefined;
        if (category === "Weapon") {
          const legRows = db.filter(r =>
            r.category === "Weapon" && r.manufacturer?.toLowerCase() === mfgWord &&
            r.partType === "Rarity" && r.rarity === "Legendary"
          );
          if (weaponTypeWord) legendaryRow = legRows.find(r =>
            r.weaponType?.toLowerCase() === weaponTypeWord || r.weaponType?.toLowerCase().includes(weaponTypeWord)
          );
          if (!legendaryRow) legendaryRow = legRows[0];
        } else {
          legendaryRow = db.find(r =>
            r.category === category && r.manufacturer?.toLowerCase() === mfgWord &&
            ((category === "Class Mod") ? (r.partType === "Name" && r.rarity === "Legendary") :
              (r.partType === "Rarity" && r.rarity === "Legendary"))
          );
        }
        if (legendaryRow) {
          const { typeId, partId } = parseCode(legendaryRow.code);
          const displayName = (category === "Weapon" || category === "Class Mod")
            ? legendaryRow.partName || `${mfgName} Legendary`
            : (legendaryRow.effect || "").replace(/\s*skin\s*$/i, "").trim() || `${mfgName} Legendary`;
          results.push({
            slot: slot.slot, mobaName, mobaType: slot.type, category, confidence: "fuzzy",
            match: {
              code: legendaryRow.code, partName: displayName, partType: legendaryRow.partType,
              manufacturer: mfgName, weaponType: legendaryRow.weaponType || undefined,
              rarity: "Legendary", effect: legendaryRow.effect || undefined, typeId, partId,
            },
          });
          continue;
        }
      }
      results.push({ slot: slot.slot, mobaName, mobaType: slot.type, category, confidence: "not_found" });
    }
  }
  return results;
}

// ── Stock Item Assembler ────────────────────────────────────────────────────

const ELEMENTS: { code: string; name: string }[] = [
  { code: "{1:10}", name: "Corrosive" },
  { code: "{1:11}", name: "Cryo" },
  { code: "{1:12}", name: "Fire" },
  { code: "{1:13}", name: "Radiation" },
  { code: "{1:14}", name: "Shock" },
];

function pickParts(
  db: UniversalRow[], typeId: string, partType: string, count: number,
  prefer?: string[],
): { partId: string; name?: string }[] {
  const rows = db.filter(r => parseCode(r.code).typeId === typeId && r.partType === partType);
  if (rows.length === 0) return [];
  const sorted = [...rows];
  if (prefer?.length) {
    sorted.sort((a, b) => {
      const aM = prefer.some(p => (a.partName || a.effect || "").toLowerCase().includes(p.toLowerCase()));
      const bM = prefer.some(p => (b.partName || b.effect || "").toLowerCase().includes(p.toLowerCase()));
      return aM === bM ? 0 : aM ? -1 : 1;
    });
  }
  return sorted.slice(0, count).map(r => ({
    partId: parseCode(r.code).partId,
    name: r.partName || r.effect || undefined,
  }));
}

function resolveManufacturerParts(
  db: UniversalRow[], typeId: string, hints: string[],
): string[] {
  // hints like "Jakobs (Ricochet Accessory)", "Ripper (Charge Mag)"
  const codes: string[] = [];
  const allMfgParts = db.filter(r =>
    parseCode(r.code).typeId === typeId && r.partType === "Manufacturer Part"
  );

  for (const hint of hints) {
    // Extract key words: "Amp (Amplified)" → try "amp", "amplified"
    // "Enrage (Experimental)" → try "enrage", "experimental"
    const words = hint.replace(/[()]/g, " ").split(/\s+/).filter(w => w.length > 2);
    const normHint = normalize(hint);

    let found = false;
    // Try each word as a search term
    for (const word of [normHint, ...words.map(normalize)]) {
      if (found) break;
      const match = allMfgParts.find(r => {
        const n = normalize(r.partName || "") + " " + normalize(r.effect || "");
        return n.includes(word);
      });
      if (match) {
        codes.push(parseCode(match.code).partId);
        found = true;
      }
    }
  }

  // Fill remaining slots (up to 4) with defaults
  const used = new Set(codes);
  for (const r of allMfgParts) {
    if (codes.length >= 4) break;
    const pid = parseCode(r.code).partId;
    if (!used.has(pid)) { codes.push(pid); used.add(pid); }
  }

  return codes.slice(0, 4);
}

/** Resolve firmware names to part codes for a given category.
 *  firmwareHint format: "3x Deadeye, 2x High Caliber" or just slot-specific firmware titles.
 *  Returns array of {typeId:partId} strings. */
function resolveFirmware(
  db: UniversalRow[], category: string, slotFirmwareTitle: string | null, firmwareHintText: string | null,
): string[] {
  // Map category to the typeId used for firmware
  const fwTypeIds: Record<string, string> = {
    "Shield": "246", "Grenade": "245", "Repkit": "243", "Heavy": "244",
    "Class Mod": "234", "Enhancement": "247",
  };
  const fwTypeId = fwTypeIds[category];
  if (!fwTypeId) return [];

  const fwRows = db.filter(r =>
    r.partType === "Firmware" && parseCode(r.code).typeId === fwTypeId
  );
  if (fwRows.length === 0) {
    // Fallback: search across all categories for same firmware name
    const allFw = db.filter(r => r.partType === "Firmware");
    if (allFw.length === 0) return [];
  }

  const results: string[] = [];

  // 1. Use slot-specific firmware title (e.g. "Deadeye" from the firmware slot)
  if (slotFirmwareTitle) {
    const normTitle = normalize(slotFirmwareTitle);
    const match = fwRows.find(r => normalize(r.partName || "").includes(normTitle));
    if (match) {
      const pid = parseCode(match.code).partId;
      results.push(`{${fwTypeId}:${pid}}`);
    }
  }

  // 2. Parse firmwareHint text for counts: "3x Deadeye, 2x High Caliber"
  if (firmwareHintText) {
    const parts = firmwareHintText.split(/[,|]/).map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      const countMatch = part.match(/^(\d+)[x/]\s*(.+)/i);
      const fwName = countMatch ? countMatch[2].trim() : part;
      const count = countMatch ? parseInt(countMatch[1]) : 1;
      const normName = normalize(fwName);
      const match = fwRows.find(r =>
        normalize(r.partName || "").includes(normName) ||
        normName.includes(normalize(r.partName || ""))
      );
      if (match) {
        const pid = parseCode(match.code).partId;
        for (let i = 0; i < Math.min(count, 3); i++) {
          results.push(`{${fwTypeId}:${pid}}`);
        }
      }
    }
  }

  // Deduplicate isn't needed — stacking firmware is valid in BL4
  return results;
}

/** Resolve class mod skills with proper tier levels.
 *  Each skill has 5 tier IDs (sorted ascending). Level N means use first N tier IDs. */
function resolveClassModSkills(
  db: UniversalRow[], typeId: string, character: string,
  skills: { name: string; level: number }[],
): string[] {
  const allSkills = db.filter(r =>
    r.category === "Class Mod" && r.partType === "Skill" &&
    (r.manufacturer === character || parseCode(r.code).typeId === typeId)
  );

  // Group by skill name → sorted IDs (tier 1-5)
  const skillGroups = new Map<string, number[]>();
  for (const row of allSkills) {
    const name = (row.partName || "").trim();
    if (!name) continue;
    const pid = parseInt(parseCode(row.code).partId);
    if (!skillGroups.has(name)) skillGroups.set(name, []);
    skillGroups.get(name)!.push(pid);
  }
  for (const [, ids] of skillGroups) ids.sort((a, b) => a - b);

  const parts: string[] = [];
  for (const skill of skills) {
    const normName = normalize(skill.name);
    // Find matching skill group
    let matched: number[] | undefined;
    for (const [name, ids] of skillGroups) {
      if (normalize(name) === normName || normalize(name).includes(normName)) {
        matched = ids;
        break;
      }
    }
    if (matched) {
      // Level N = use first N tier IDs
      const tierCount = Math.max(1, Math.min(5, skill.level));
      for (let i = 0; i < tierCount && i < matched.length; i++) {
        parts.push(`{${matched[i]}}`);
      }
    }
  }
  return parts;
}

function resolveUnderbarrel(
  db: UniversalRow[], typeId: string, hint: string | null,
): string | null {
  if (!hint) return null;
  const normHint = normalize(hint);
  const underbarrels = db.filter(r =>
    parseCode(r.code).typeId === typeId && r.partType === "Underbarrel"
  );
  const match = underbarrels.find(r =>
    normalize(r.partName || "").includes(normHint) ||
    normalize(r.effect || "").includes(normHint)
  );
  return match ? parseCode(match.code).partId : (underbarrels[0] ? parseCode(underbarrels[0].code).partId : null);
}

function assembleWeapon(
  resolved: ResolvedItem, level: number, context: BuildContext, elementCode: string | null,
): StockItem | null {
  if (!resolved.match) return null;
  const db = loadDb();
  const { typeId, partId } = resolved.match;

  const seed = Math.floor(Math.random() * 9000) + 1000;

  // ── Check godrolls first ─────────────────────────────────────────────
  const elementName = elementCode
    ? ELEMENTS.find(e => e.code === elementCode)?.name || null
    : null;
  const godroll = findGodroll(resolved.match.partName, elementName ?? undefined);
  if (godroll) {
    let decoded = godroll.decoded
      .replace(/^(\d+),\s*0,\s*1,\s*\d+/, `$1, 0, 1, ${level}`)
      .replace(/\|\s*2,\s*\d+\s*\|/, `| 2, ${seed}|`);
    // Swap element if needed
    if (elementCode) decoded = swapElement(decoded, elementName);
    const grTypeId = decoded.match(/^(\d+)/)?.[1] || typeId;
    return {
      slot: resolved.slot, category: "Weapon",
      itemName: `${resolved.match.partName} (Godroll)`,
      manufacturer: resolved.match.manufacturer,
      weaponType: resolved.match.weaponType,
      element: elementName || undefined,
      decoded, typeId: grTypeId, confidence: "exact",
      notes: `From godroll: ${godroll.name}`,
    };
  }

  // ── Fall back to DB assembly ─────────────────────────────────────────
  const parts: string[] = [];

  // 1. Rarity (the legendary)
  parts.push(`{${partId}}`);

  // 2. Body
  const bodies = pickParts(db, typeId, "Body", 1);
  if (bodies.length > 0) parts.push(`{${bodies[0].partId}}`);

  // 3. Body Accessories (4)
  const bodyAcc = pickParts(db, typeId, "Body Accessory", 4, ["damage", "fire rate"]);
  for (const p of bodyAcc) parts.push(`{${p.partId}}`);

  // 4. Element
  if (elementCode) parts.push(elementCode);

  // 5. Barrel — find matching legendary barrel
  const barrels = db.filter(r => parseCode(r.code).typeId === typeId && r.partType === "Barrel");
  const legendaryBarrel = barrels.find(r => normalize(r.partName || "") === normalize(resolved.match!.partName));
  const barrelPid = legendaryBarrel ? parseCode(legendaryBarrel.code).partId
    : (barrels[0] ? parseCode(barrels[0].code).partId : null);
  if (barrelPid) parts.push(`{${barrelPid}}`);

  // 6. Barrel Accessories (4)
  const barrelAcc = pickParts(db, typeId, "Barrel Accessory", 4, ["damage", "fire rate"]);
  for (const p of barrelAcc) parts.push(`{${p.partId}}`);

  // 7. Magazine
  const mags = pickParts(db, typeId, "Magazine", 1);
  if (mags.length > 0) parts.push(`{${mags[0].partId}}`);

  // 8. Scope + Scope Accessories (1 + 5)
  const scopes = pickParts(db, typeId, "Scope", 1);
  if (scopes.length > 0) parts.push(`{${scopes[0].partId}}`);
  const scopeAcc = pickParts(db, typeId, "Scope Accessory", 5, ["damage"]);
  for (const p of scopeAcc) parts.push(`{${p.partId}}`);

  // 9. Grip
  const grips = pickParts(db, typeId, "Grip", 1, ["damage"]);
  if (grips.length > 0) parts.push(`{${grips[0].partId}}`);

  // 10. Stat Modifier
  const stats = pickParts(db, typeId, "Stat Modifier", 1);
  if (stats.length > 0) parts.push(`{${stats[0].partId}}`);

  // 11. Manufacturer Parts — use context hints
  const mfgPartIds = resolveManufacturerParts(db, typeId, context.weaponHints.manufacturerParts);
  for (const pid of mfgPartIds) parts.push(`{${pid}}`);

  // 12. Foregrip
  const foregrips = pickParts(db, typeId, "Foregrip", 1, ["damage", "fire rate"]);
  if (foregrips.length > 0) parts.push(`{${foregrips[0].partId}}`);

  // 13. Underbarrel — check per-weapon first, then global
  const itemName = resolved.match!.partName;
  const perWeaponHint = context.weaponHints.perWeapon[itemName];
  const ubHint = perWeaponHint?.underbarrel || context.weaponHints.underbarrel;
  const ubPid = resolveUnderbarrel(db, typeId, ubHint);
  if (ubPid) parts.push(`{${ubPid}}`);

  const decoded = `${typeId}, 0, 1, ${level}| 2, ${seed}|| ${parts.join(" ")}|`;

  return {
    slot: resolved.slot,
    category: "Weapon",
    itemName: resolved.match.partName,
    manufacturer: resolved.match.manufacturer,
    weaponType: resolved.match.weaponType,
    element: elementName || undefined,
    decoded,
    typeId,
    confidence: resolved.confidence,
    notes: elementName ? `${elementName} variant` : undefined,
  };
}

function assembleAccessory(
  resolved: ResolvedItem, level: number, firmware: MobaGearSlot[],
  context: BuildContext, allResolved?: ResolvedItem[],
): StockItem | null {
  if (!resolved.match) return null;
  const db = loadDb();
  const { typeId, partId } = resolved.match;
  const category = resolved.category;

  const seed = Math.floor(Math.random() * 9000) + 1000;
  const parts: string[] = [];

  // Resolve firmware name → firmware part code for this item type
  const fwSlugMap: Record<string, string> = {};
  for (const fw of firmware) {
    // Map slot to our category: "repkit-firmware" → "Repkit", "shield-firmware" → "Shield"
    const slotCat = fw.slot.replace("-firmware", "");
    fwSlugMap[slotCat] = fw.title;
  }

  // Get firmware title for this category from variant firmware slots
  const fwSlotKey = category.toLowerCase().replace(" ", "-") + "-firmware";
  const slotFw = firmware.find(f => f.slot === fwSlotKey);
  const slotFwTitle = slotFw?.title || null;

  if (category === "Shield") {
    parts.push(`{${partId}}`);
    if (resolved.match.partType === "Legendary Perk") {
      const rarityRow = db.find(r =>
        r.category === "Shield" && r.partType === "Rarity" && r.rarity === "Legendary" &&
        r.manufacturer === resolved.match!.manufacturer && parseCode(r.code).typeId === typeId
      );
      if (rarityRow) {
        parts.length = 0;
        parts.push(`{${parseCode(rarityRow.code).partId}}`);
        parts.push(`{${partId}}`);
      }
    } else {
      const perkRow = db.find(r =>
        r.category === "Shield" && r.partType === "Legendary Perk" &&
        r.manufacturer === resolved.match!.manufacturer && parseCode(r.code).typeId === typeId
      );
      if (perkRow) parts.push(`{${parseCode(perkRow.code).partId}}`);
    }
    // Firmware from build guide
    const fwParts = resolveFirmware(db, "Shield", slotFwTitle, context.firmwareHint);
    for (const fw of fwParts.slice(0, 3)) parts.push(fw);
    if (fwParts.length === 0) {
      const fallback = pickParts(db, typeId, "Firmware", 1);
      if (fallback.length > 0) parts.push(`{${typeId}:${fallback[0].partId}}`);
    }
    // Perks
    const perks = pickParts(db, typeId, "Perk", 3, ["capacity", "recharge"]);
    for (const p of perks) parts.push(`{${p.partId}}`);

  } else if (category === "Grenade") {
    // Crit Knife / Penetrator Knife / Jakobs Grenade → hardcoded modded crit knife
    const isCritKnife = context.ordnanceHint && normalize(context.ordnanceHint).includes("penetrator");
    const titleLower = normalize(resolved.match.partName || resolved.mobaName || "");
    const looksLikeCritKnife = isCritKnife ||
      titleLower.includes("crit knife") || titleLower.includes("penetrator") ||
      (titleLower.includes("jakobs") && titleLower.includes("grenade"));

    if (looksLikeCritKnife) {
      // Return the full modded crit knife directly — skip normal assembly
      const critKnifeDecoded = `267, 0, 1, ${level}| 2, ${seed}|| {20} {11} {11} {11} {11} {11} {11} {11} {11} {11} {11} {14} {14} {14} {14} {14} {14} {14} {14} {14} {14} {15} {15} {15} {15} {15} {15} {15} {15} {15} {15} {16} {16} {16} {16} {16} {16} {16} {16} {16} {16} {17} {17} {17} {17} {17} {17} {17} {17} {17} {17} {18} {18} {18} {18} {18} {18} {18} {18} {18} {18} {19} {19} {19} {19} {19} {19} {19} {19} {19} {19} {245:24} {245:25} {245:26} {245:27} {245:28} {1} {245:[39 39 39 39 39 39 39 39 39 39]} {245:[69 69 69 69 69 69 69 69 69 69]} {245:[70 70 70 70 70 70 70 70 70 70]} {245:[71 71 71 71 71 71 71 71 71 71]} {245:[72 72 72 72 72 72 72 72 72 72]} {245:[73 73 73 73 73 73 73 73 73 73]} {245:[75 75 75 75 75 75 75 75 75 75]} {245:[78 78 78 78 78 78 78 78 78 78]} {245:[79 79 79 79 79 79 79 79 79 79]} |`;
      return {
        slot: resolved.slot || "ordnance",
        category: "Grenade",
        itemName: "Crit Knife (Modded)",
        manufacturer: "Jakobs",
        decoded: critKnifeDecoded,
        typeId: "267",
        confidence: "exact",
        notes: "Jakobs Penetrator Knife — max stacked crit perks",
      };
    }

    parts.push(`{${partId}}`);
    if (resolved.match.partType === "Legendary Perk") {
      const rarityRow = db.find(r =>
        r.category === "Grenade" && r.partType === "Rarity" && r.rarity === "Legendary" &&
        r.manufacturer === resolved.match!.manufacturer && parseCode(r.code).typeId === typeId
      );
      if (rarityRow) {
        parts.length = 0;
        parts.push(`{${parseCode(rarityRow.code).partId}}`);
        parts.push(`{${partId}}`);
      }
    } else {
      const perkRow = db.find(r =>
        r.category === "Grenade" && r.partType === "Legendary Perk" &&
        r.manufacturer === resolved.match!.manufacturer && parseCode(r.code).typeId === typeId
      );
      if (perkRow) parts.push(`{${parseCode(perkRow.code).partId}}`);
    }

    // Firmware from build guide
    const fwParts = resolveFirmware(db, "Grenade", slotFwTitle, context.firmwareHint);
    for (const fw of fwParts.slice(0, 3)) parts.push(fw);

    // Universal grenade perks
    const uniPerks = pickParts(db, "245", "Perk", 3, ["damage", "radius"]);
    for (const p of uniPerks) parts.push(`{245:${p.partId}}`);

  } else if (category === "Repkit") {
    parts.push(`{${partId}}`);
    if (resolved.match.partType === "Legendary Perk") {
      const rarityRow = db.find(r =>
        r.category === "Repkit" && r.partType === "Rarity" && r.rarity === "Legendary" &&
        r.manufacturer === resolved.match!.manufacturer && parseCode(r.code).typeId === typeId
      );
      if (rarityRow) {
        parts.length = 0;
        parts.push(`{${parseCode(rarityRow.code).partId}}`);
        parts.push(`{${partId}}`);
      }
    } else {
      const perkRow = db.find(r =>
        r.category === "Repkit" && r.partType === "Legendary Perk" &&
        r.manufacturer === resolved.match!.manufacturer && parseCode(r.code).typeId === typeId
      );
      if (perkRow) parts.push(`{${parseCode(perkRow.code).partId}}`);
    }
    // Firmware from build guide
    const fwParts = resolveFirmware(db, "Repkit", slotFwTitle, context.firmwareHint);
    for (const fw of fwParts.slice(0, 3)) parts.push(fw);
    // Universal repkit prefix
    const prefix = pickParts(db, "243", "Prefix", 1);
    if (prefix.length > 0) parts.push(`{243:${prefix[0].partId}}`);
    // Resistance
    const resist = pickParts(db, "243", "Resistance", 1);
    if (resist.length > 0) parts.push(`{243:${resist[0].partId}}`);

    // Repkit perks from context (e.g. "Amp", "Enrage")
    if (context.repkitPerks && context.repkitPerks.length > 0) {
      const allRepkitPerks = db.filter(r => r.category === "Repkit" && (r.partType === "Perk" || r.partType === "Universal Perk"));
      for (const hint of context.repkitPerks) {
        const words = hint.replace(/[()]/g, " ").split(/\s+/).filter(w => w.length > 2);
        for (const word of words.map(normalize)) {
          const match = allRepkitPerks.find(r => normalize(r.partName || "").includes(word));
          if (match) {
            parts.push(`{243:${parseCode(match.code).partId}}`);
            break;
          }
        }
      }
    }

  } else if (category === "Class Mod") {
    // Class mod: name + rarity + skills with proper tier levels + firmware + perks
    parts.push(`{${partId}}`);
    // Legendary rarity from legendary map
    const rarityRow = db.find(r =>
      r.category === "Class Mod" && r.partType === "Rarity" && r.rarity === "Legendary" &&
      parseCode(r.code).typeId === typeId
    );
    if (rarityRow) parts.push(`{${parseCode(rarityRow.code).partId}}`);

    // Skills from context WITH PROPER TIER LEVELS
    const character = resolved.match.manufacturer || "";
    if (context.classModSkills.length > 0) {
      const skillParts = resolveClassModSkills(db, typeId, character, context.classModSkills);
      for (const sp of skillParts) parts.push(sp);
    }

    // Firmware for class mod
    const fwParts = resolveFirmware(db, "Class Mod", slotFwTitle, context.firmwareHint);
    for (const fw of fwParts.slice(0, 3)) parts.push(fw);

    // Perks from universal type 234
    const perks = pickParts(db, "234", "Perk", 3, ["damage", "crit"]);
    for (const p of perks) parts.push(`{234:${p.partId}}`);

  } else if (category === "Enhancement") {
    parts.push(`{${partId}}`);
    // Enhancement rarity
    const rarityRow = db.find(r =>
      r.category === "Enhancement" && r.partType === "Rarity" && r.rarity === "Legendary" &&
      parseCode(r.code).typeId === typeId
    );
    if (rarityRow) parts.push(`{${parseCode(rarityRow.code).partId}}`);

    // 247 rarity too
    const r247 = db.find(r =>
      parseCode(r.code).typeId === "247" && r.partType === "Rarity" && r.rarity === "Legendary"
    );
    if (r247) parts.push(`{247:${parseCode(r247.code).partId}}`);

    // ── Core perks from this enhancement's manufacturer ─────────────────
    const corePerks = db.filter(r =>
      r.category === "Enhancement" && r.partType === "Core Perk" &&
      parseCode(r.code).typeId === typeId
    );
    for (const p of corePerks.slice(0, 4)) parts.push(`{${parseCode(p.code).partId}}`);

    // ── Cross-manufacturer perks from ALL weapons + their mfg parts ────
    if (allResolved) {
      const weaponMfgs = new Set<string>();
      const weaponTypes = new Set<string>();
      const referencedMfgs = new Set<string>(); // mfgs from weapon manufacturer parts

      for (const r of allResolved) {
        if (r.category === "Weapon" && r.match) {
          if (r.match.manufacturer) weaponMfgs.add(r.match.manufacturer);
          if (r.match.weaponType) weaponTypes.add(r.match.weaponType.toLowerCase());

          // Find manufacturer parts on this weapon and extract referenced manufacturers
          const wTypeId = r.match.typeId;
          const mfgPartsOnWeapon = db.filter(row =>
            parseCode(row.code).typeId === wTypeId && row.partType === "Manufacturer Part"
          );
          const MFG_KEYWORDS = ["hyperion", "tediore", "torgue", "jakobs", "maliwan",
            "daedalus", "vladof", "ripper", "order", "atlas", "cov"];
          for (const mp of mfgPartsOnWeapon) {
            const partName = (mp.partName || "").toLowerCase();
            for (const kw of MFG_KEYWORDS) {
              if (partName.includes(kw)) {
                // Map keyword to proper manufacturer name
                const mfgNameMap: Record<string, string> = {
                  "hyperion": "Hyperion", "tediore": "Tediore", "torgue": "Torgue",
                  "jakobs": "Jakobs", "maliwan": "Maliwan", "daedalus": "Daedalus",
                  "vladof": "Vladof", "ripper": "Ripper", "order": "The Order",
                  "atlas": "Atlas", "cov": "COV",
                };
                referencedMfgs.add(mfgNameMap[kw] || kw);
              }
            }
          }
        }
      }

      // Combine weapon manufacturers + referenced manufacturers from parts
      const allMfgs = new Set([...weaponMfgs, ...referencedMfgs]);

      // Add core perks from each manufacturer's enhancement
      const enhMfgs = db.filter(r => r.category === "Enhancement" && r.partType === "Core Perk");
      const addedMfgTypeIds = new Set([typeId]); // skip own mfg (already added above)
      for (const mfg of allMfgs) {
        const mfgPerks = enhMfgs.filter(r =>
          r.manufacturer === mfg && !addedMfgTypeIds.has(parseCode(r.code).typeId)
        );
        if (mfgPerks.length > 0) {
          const mfgTypeId = parseCode(mfgPerks[0].code).typeId;
          addedMfgTypeIds.add(mfgTypeId);
          // Add all core perks from this manufacturer as cross-mfg (stacked)
          for (const p of mfgPerks.slice(0, 4)) {
            parts.push(`{${mfgTypeId}:${parseCode(p.code).partId}}`);
          }
        }
      }

      // ── Weapon-type specific stat perks (247) ─────────────────────────
      // Map weapon types to stat perk search terms
      const typeStatMap: Record<string, string[]> = {
        "shotgun": ["shotgun damage", "shotgun mag", "shotgun splash"],
        "pistol": ["pistol damage", "pistol mag"],
        "smg": ["smg damage", "smg mag"],
        "sniper": ["sniper damage", "sniper mag", "sniper crit"],
        "assault rifle": ["assault rifle damage", "assault rifle mag"],
        "ar": ["assault rifle damage", "assault rifle mag"],
      };

      const statPerks = db.filter(r =>
        parseCode(r.code).typeId === "247" && (r.partType === "Stat Perk" || r.partType === "Stat Group1")
      );
      const addedStatPids = new Set<string>();

      for (const wType of weaponTypes) {
        const searchTerms = typeStatMap[wType] || [`${wType} damage`];
        for (const term of searchTerms) {
          const normTerm = normalize(term);
          const match = statPerks.find(r =>
            !addedStatPids.has(parseCode(r.code).partId) &&
            (normalize(r.partName || "").includes(normTerm) ||
             normalize(r.effect || "").includes(normTerm))
          );
          if (match) {
            const pid = parseCode(match.code).partId;
            addedStatPids.add(pid);
            parts.push(`{247:${pid}}`);
          }
        }
      }
    }

    // ── Enhancement stats from build guide text ─────────────────────────
    if (context.enhancementStats.length > 0) {
      const statRows = db.filter(r =>
        (parseCode(r.code).typeId === "247") && (r.partType === "Stat Perk" || r.partType === "Stat Group1")
      );
      for (const stat of context.enhancementStats.slice(0, 6)) {
        const normStat = normalize(stat);
        const match = statRows.find(r =>
          normalize(r.partName || "").includes(normStat) ||
          normalize(r.effect || "").includes(normStat)
        );
        if (match) parts.push(`{247:${parseCode(match.code).partId}}`);
      }
    }

    // ── Universal beneficial stat perks ─────────────────────────────────
    const universalStats = ["gun damage", "gun crit damage", "movement speed", "reload speed"];
    const uniStatRows = db.filter(r =>
      parseCode(r.code).typeId === "247" && (r.partType === "Stat Perk" || r.partType === "Stat Group1")
    );
    for (const uStat of universalStats) {
      const normU = normalize(uStat);
      const match = uniStatRows.find(r =>
        normalize(r.partName || "").includes(normU) ||
        normalize(r.effect || "").includes(normU)
      );
      if (match) parts.push(`{247:${parseCode(match.code).partId}}`);
    }

    // Enhancement firmware
    const fwParts = resolveFirmware(db, "Enhancement", slotFwTitle, context.firmwareHint);
    for (const fw of fwParts.slice(0, 3)) parts.push(fw);
  }

  const decoded = `${typeId}, 0, 1, ${level}| 2, ${seed}|| ${parts.join(" ")}|`;

  return {
    slot: resolved.slot, category,
    itemName: resolved.match.partName, manufacturer: resolved.match.manufacturer,
    decoded, typeId, confidence: resolved.confidence,
  };
}

export function assembleBuild(
  buildName: string,
  character: string,
  variantName: string,
  resolved: ResolvedItem[],
  context: BuildContext,
  firmware: MobaGearSlot[],
  level: number = 60,
): AssembledBuild {
  const items: StockItem[] = [];
  const skipped: { slot: string; reason: string }[] = [];

  // Figure out which weapon is the "main" weapon (appears in multiple slots)
  // Only the main weapon gets elemental variants; utility weapons get one copy
  const weaponNameCounts: Record<string, number> = {};
  for (const r of resolved) {
    if (r.category === "Weapon" && r.match) {
      weaponNameCounts[r.match.partName] = (weaponNameCounts[r.match.partName] || 0) + 1;
    }
  }
  const mainWeaponName = Object.entries(weaponNameCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  // Track which weapons we've already generated elemental sets for (dedup)
  const elementalSetsGenerated = new Set<string>();

  for (const r of resolved) {
    if (r.confidence === "not_found" || !r.match) {
      skipped.push({ slot: r.slot, reason: `Could not resolve "${r.mobaName}"` });
      continue;
    }

    if (r.category === "Weapon") {
      const isMainWeapon = r.match.partName === mainWeaponName && (weaponNameCounts[mainWeaponName] ?? 0) > 1;
      if (context.weaponHints.allElements && isMainWeapon) {
        // Generate one set of elemental variants (not per-slot)
        if (!elementalSetsGenerated.has(r.match.partName)) {
          elementalSetsGenerated.add(r.match.partName);
          for (const el of ELEMENTS) {
            const item = assembleWeapon(r, level, context, el.code);
            if (item) items.push(item);
          }
        }
      } else if (context.weaponHints.dominantElement) {
        // Build has a dominant element (e.g. "Radiation Chroma") — apply to all weapons
        const elEntry = ELEMENTS.find(e =>
          e.name.toLowerCase() === context.weaponHints.dominantElement!.toLowerCase()
        );
        const item = assembleWeapon(r, level, context, elEntry?.code || null);
        if (item) items.push(item);
      } else {
        // Single weapon — no element
        const item = assembleWeapon(r, level, context, null);
        if (item) items.push(item);
      }
    } else {
      const item = assembleAccessory(r, level, firmware, context, resolved);
      if (item) items.push(item);
    }
  }

  // Auto-generate enhancement if not in resolved but firmware exists for it
  const hasEnhancement = items.some(it => it.category === "Enhancement");
  const hasEnhFirmware = firmware.some(f => f.slot === "enhancement-firmware");
  if (!hasEnhancement && hasEnhFirmware) {
    const db = loadDb();
    // Pick a default enhancement manufacturer based on the weapons in the build
    const weaponMfgs = new Set<string>();
    for (const r of resolved) {
      if (r.category === "Weapon" && r.match?.manufacturer) weaponMfgs.add(r.match.manufacturer);
    }
    // Find enhancement manufacturer entries
    const enhMfgs = db.filter(r => r.category === "Enhancement" && r.partType === "Rarity" && r.rarity === "Legendary");
    // Prefer a manufacturer matching one of our weapons
    let enhRow = enhMfgs.find(r => weaponMfgs.has(r.manufacturer || ""));
    if (!enhRow && enhMfgs.length > 0) enhRow = enhMfgs[0];

    if (enhRow) {
      const enhTypeId = parseCode(enhRow.code).typeId;
      const fakeResolved: ResolvedItem = {
        slot: "enhancement",
        mobaName: "Auto Enhancement",
        mobaType: "enhancements",
        category: "Enhancement",
        confidence: "fuzzy",
        match: {
          code: enhRow.code,
          partName: (enhRow.manufacturer || "Unknown") + " Enhancement",
          partType: "Rarity",
          manufacturer: enhRow.manufacturer || "",
          rarity: "Legendary",
          typeId: enhTypeId,
          partId: parseCode(enhRow.code).partId,
        },
      };
      const enhItem = assembleAccessory(fakeResolved, level, firmware, context, resolved);
      if (enhItem) items.push(enhItem);
    }
  }

  return { buildName, character, variantName, items, skipped };
}

// ── Maxroll Assembler ──────────────────────────────────────────────────────
// Maxroll provides fully structured data (manufacturer, legendaryId, augments,
// firmware, weapon type) so we can map directly to DB parts without fuzzy matching.

// ── Godroll Priority System ───────────────────────────────────────────────
// Always check godrolls.json first for weapon templates. Use the godroll as
// the base decoded string, then only modify element if needed.

interface GodrollEntry { name: string; decoded: string }
let godrollCache: GodrollEntry[] | null = null;

function loadGodrolls(): GodrollEntry[] {
  if (godrollCache) return godrollCache;
  const p = join(repoRoot, "godrolls.json");
  if (!existsSync(p)) return [];
  try {
    godrollCache = JSON.parse(readFileSync(p, "utf-8")) as GodrollEntry[];
    return godrollCache;
  } catch { return []; }
}

/** Normalize a name for fuzzy matching: lowercase, strip spaces/punctuation */
function normGodroll(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Find the best godroll match for a weapon name.
 * Returns the godroll entry or null. Prefers non-elemental base versions.
 */
function findGodroll(weaponName: string, element?: string): GodrollEntry | null {
  const godrolls = loadGodrolls();
  if (!godrolls.length) return null;
  const normName = normGodroll(weaponName);
  if (!normName || normName.length < 3) return null;

  // Element names for stripping/matching
  const ELEMENTS = ["fire", "cryo", "shock", "radiation", "corrosive"];

  // First: try exact element + name match (e.g. "Cryo Bod Absorb Shield Sticky Gyrojet")
  if (element) {
    const normEl = normGodroll(element);
    const match = godrolls.find(g => {
      const n = normGodroll(g.name);
      return n.includes(normName) && n.includes(normEl);
    });
    if (match) return match;
  }

  // Second: try non-elemental version (base name match, no element prefix)
  const baseMatch = godrolls.find(g => {
    const n = normGodroll(g.name);
    // Check the godroll name doesn't start with an element
    const startsWithElement = ELEMENTS.some(el => n.startsWith(el));
    return !startsWithElement && n.includes(normName);
  });
  if (baseMatch) return baseMatch;

  // Third: any version containing the weapon name
  const anyMatch = godrolls.find(g => normGodroll(g.name).includes(normName));
  if (anyMatch) return anyMatch;

  return null;
}

/**
 * Take a godroll decoded string and swap the element if needed.
 * Element tokens are {1:10}=Corrosive, {1:11}=Cryo, {1:12}=Fire, {1:13}=Radiation, {1:14}=Shock
 */
function swapElement(decoded: string, newElement: string | null): string {
  if (!newElement) return decoded;
  const ELEMENT_CODES: Record<string, string> = {
    corrosive: "{1:10}", cryo: "{1:11}", fire: "{1:12}", radiation: "{1:13}", shock: "{1:14}",
  };
  const newCode = ELEMENT_CODES[newElement.toLowerCase()];
  if (!newCode) return decoded;

  // Remove any existing element token and add the new one
  const cleaned = decoded.replace(/\{1:\d+\}\s*/g, "");
  // Insert after the first part token
  return cleaned.replace(/\|\|\s*/, `|| ${newCode} `);
}

/** Manufacturer name → capitalize for DB matching */
const MFG_CAPITALIZE: Record<string, string> = {
  torgue: "Torgue", maliwan: "Maliwan", daedalus: "Daedalus", jakobs: "Jakobs",
  ripper: "Ripper", vladof: "Vladof", tediore: "Tediore", order: "Order",
  atlas: "Atlas", cov: "COV", hyperion: "Hyperion",
};

/** Weapon type → DB weaponType */
const WEAPON_TYPE_MAP: Record<string, string> = {
  pistol: "Pistol", smg: "SMG", shotgun: "Shotgun", sniper: "Sniper",
  assault_rifle: "Assault Rifle", ar: "Assault Rifle",
};

/** Maxroll item type → our category */
const MAXROLL_TYPE_MAP: Record<string, string> = {
  "bl4-weapon": "Weapon", "bl4-shield": "Shield", "bl4-ordnance": "Grenade",
  "bl4-repkit": "Repkit", "bl4-class-mod": "Class Mod", "bl4-enhancement": "Enhancement",
};

/** Maxroll augmentId → DB internalName pattern */
function maxrollAugmentToInternalName(augId: string): string {
  // lp-bor-mag → part_mag_05_borg (Ripper Mag)
  // lp-tor-sticky → part_mag_torgue_sticky
  // lp-jak-ricochet ��� part_barrel_licensed_jak
  // lp-ted-reload → part_barrel_licensed_ted
  // lp-hyp-shield → part_shield_default or part_shield_amp etc.
  // shieldaug-eng-amp → part_eng_amp (shield energy amp)
  // repkit-aug-u-alldmg → part_aug_u_alldmg_on_use
  // grenade-payload-damage-amp-aug-penetrator → part_07_damage_amp_03_penetrator

  if (augId === "lp-bor-mag") return "part_mag_05_borg";
  if (augId === "lp-tor-sticky") return "part_mag_torgue_sticky";
  if (augId.startsWith("lp-jak")) return "part_barrel_licensed_jak";
  if (augId.startsWith("lp-ted-mirv")) return "part_barrel_licensed_ted_mirv";
  if (augId.startsWith("lp-ted-combo")) return "part_barrel_licensed_ted_combo";
  if (augId.startsWith("lp-ted-shoot")) return "part_barrel_licensed_ted_shooting";
  if (augId.startsWith("lp-ted")) return "part_barrel_licensed_ted";
  if (augId.startsWith("lp-hyp")) return "part_barrel_licensed_hyp";
  if (augId.includes("penetrator")) return "part_07_damage_amp_03_penetrator";
  if (augId === "shieldaug-eng-amp") return "part_eng_amp";
  if (augId.startsWith("repkit-aug-u-alldmg")) return "part_aug_u_alldmg_on_use";
  if (augId.startsWith("repkit-aug-")) {
    // repkit-aug-u-XYZ → part_aug_u_XYZ_on_use
    const suffix = augId.replace("repkit-aug-", "").replace(/-/g, "_");
    return `part_aug_${suffix}_on_use`;
  }
  // Generic: replace dashes with underscores
  return augId.replace(/-/g, "_");
}

/** Maxroll firmwareId → DB internalName */
function maxrollFirmwareToInternalName(fwId: string): string {
  // high-caliber → part_firmware_high_caliber
  // deadeye → part_firmware_deadeye
  return "part_firmware_" + fwId.replace(/-/g, "_");
}

/** Extract the name from Maxroll's legendaryId: np_ScootShoot → scootshoot */
function extractLegendarySlug(legendaryId: string): string {
  // np_ScootShoot → scootshoot, np_repkit_uni_TOR_ShinyWarPaint → shinywar, etc.
  // Take the last segment after the last underscore group
  const parts = legendaryId.replace(/^np_/, "").split("_");
  // For weapon/shield/grenade: last part is the name
  // For repkit: np_repkit_uni_TOR_ShinyWarPaint → ShinyWarPaint
  // For class mod: np_cm_ds_leg_06 → leg_06
  return parts[parts.length - 1]?.toLowerCase() || legendaryId.toLowerCase();
}

interface MaxrollEquipmentSlot {
  slot: string;
  item: {
    type: string;
    customAttr: Record<string, unknown>;
  };
}

export function assembleMaxrollBuild(
  plannerName: string,
  character: string,
  equipment: MaxrollEquipmentSlot[],
  level: number = 60,
): AssembledBuild {
  const db = loadDb();
  const items: StockItem[] = [];
  const skipped: { slot: string; reason: string }[] = [];

  // Detect if Bod is in the build — triggers "All Rounder" enhancement rule
  const hasBod = equipment.some(eq => {
    if (eq.item.type !== "bl4-weapon") return false;
    const legId = String(eq.item.customAttr.legendaryId || "").toLowerCase();
    return legId.includes("bod");
  });

  for (const eq of equipment) {
    const category = MAXROLL_TYPE_MAP[eq.item.type];
    if (!category) { skipped.push({ slot: eq.slot, reason: `Unknown type: ${eq.item.type}` }); continue; }

    const attr = eq.item.customAttr;
    const mfgId = String(attr.manufacturerId || "");
    const mfg = MFG_CAPITALIZE[mfgId] || mfgId;
    const legendaryId = String(attr.legendaryId || "");
    const augmentIds = (attr.augmentIds || []) as string[];
    const firmwareId = String(attr.firmwareId || "");
    const rarity = Number(attr.rarity || 0); // 3=Epic, 4=Legendary
    const itemLevel = Number(attr.level || level);
    const seed = Math.floor(Math.random() * 9000) + 1000;

    try {
      if (category === "Weapon") {
        const wt = WEAPON_TYPE_MAP[String(attr.type || "")] || String(attr.type || "");
        const item = assembleMaxrollWeapon(db, eq.slot, mfg, wt, legendaryId, augmentIds, itemLevel, seed);
        if (item) items.push(item);
        else skipped.push({ slot: eq.slot, reason: `Could not assemble weapon: ${legendaryId || mfg + " " + wt}` });

      } else if (category === "Grenade") {
        // Check for crit knife (penetrator augment on Jakobs grenade)
        const hasPenetrator = augmentIds.some(a => a.includes("penetrator"));
        const isJakobs = mfgId === "jakobs";
        if (hasPenetrator || isJakobs) {
          // Hardcoded modded crit knife
          items.push({
            slot: eq.slot, category: "Grenade", itemName: "Crit Knife (Modded)", manufacturer: "Jakobs",
            decoded: `267, 0, 1, ${itemLevel}| 2, ${seed}|| {20} {11} {11} {11} {11} {11} {11} {11} {11} {11} {11} {14} {14} {14} {14} {14} {14} {14} {14} {14} {14} {15} {15} {15} {15} {15} {15} {15} {15} {15} {15} {16} {16} {16} {16} {16} {16} {16} {16} {16} {16} {17} {17} {17} {17} {17} {17} {17} {17} {17} {17} {18} {18} {18} {18} {18} {18} {18} {18} {18} {18} {19} {19} {19} {19} {19} {19} {19} {19} {19} {19} {245:24} {245:25} {245:26} {245:27} {245:28} {1} {245:[39 39 39 39 39 39 39 39 39 39]} {245:[69 69 69 69 69 69 69 69 69 69]} {245:[70 70 70 70 70 70 70 70 70 70]} {245:[71 71 71 71 71 71 71 71 71 71]} {245:[72 72 72 72 72 72 72 72 72 72]} {245:[73 73 73 73 73 73 73 73 73 73]} {245:[75 75 75 75 75 75 75 75 75 75]} {245:[78 78 78 78 78 78 78 78 78 78]} {245:[79 79 79 79 79 79 79 79 79 79]} |`,
            typeId: "267", confidence: "exact", notes: "Jakobs Penetrator Knife — max stacked crit perks",
          });
        } else {
          const item = assembleMaxrollAccessory(db, eq.slot, category, mfg, legendaryId, augmentIds, firmwareId, itemLevel, seed, rarity);
          if (item) items.push(item);
          else skipped.push({ slot: eq.slot, reason: `Could not assemble grenade: ${mfg}` });
        }

      } else if (category === "Class Mod") {
        const item = assembleMaxrollClassMod(db, eq.slot, character, legendaryId, firmwareId, attr, itemLevel, seed);
        if (item) items.push(item);
        else skipped.push({ slot: eq.slot, reason: `Could not assemble class mod: ${legendaryId}` });

      } else if (category === "Enhancement") {
        const item = assembleMaxrollEnhancement(db, eq.slot, mfg, firmwareId, attr, itemLevel, seed, equipment, hasBod);
        if (item) items.push(item);
        else skipped.push({ slot: eq.slot, reason: `Could not assemble enhancement: ${mfg}` });

      } else {
        // Shield, Repkit
        const item = assembleMaxrollAccessory(db, eq.slot, category, mfg, legendaryId, augmentIds, firmwareId, itemLevel, seed, rarity);
        if (item) items.push(item);
        else skipped.push({ slot: eq.slot, reason: `Could not assemble ${category}: ${mfg} ${legendaryId}` });
      }
    } catch (e) {
      skipped.push({ slot: eq.slot, reason: `Error: ${e instanceof Error ? e.message : "unknown"}` });
    }
  }

  return { buildName: plannerName, character, variantName: "Maxroll", items, skipped };
}

function assembleMaxrollWeapon(
  db: UniversalRow[], slot: string, mfg: string, weaponType: string,
  legendaryId: string, augmentIds: string[], level: number, seed: number,
): StockItem | null {
  const slug = extractLegendarySlug(legendaryId);

  // ── STEP 1: Check godrolls first ─────────────────────────────────────
  // Find the weapon's display name from DB for godroll lookup
  let weaponDisplayName = "";
  if (slug) {
    const barrelRow = db.find(r =>
      r.category === "Weapon" && r.partType === "Barrel" &&
      r.internalName?.toLowerCase().includes(slug)
    );
    if (barrelRow) weaponDisplayName = barrelRow.partName || "";
    if (!weaponDisplayName) {
      const rarRow = db.find(r =>
        r.category === "Weapon" && r.partType === "Rarity" &&
        r.internalName?.toLowerCase().includes(`legendary_${slug}`)
      );
      if (rarRow) weaponDisplayName = rarRow.partName || "";
    }
  }

  if (weaponDisplayName) {
    // Detect element from Maxroll data (elementalDamage field or augment hints)
    const godroll = findGodroll(weaponDisplayName);
    if (godroll) {
      // Use godroll as base, adjust level
      let decoded = godroll.decoded.replace(
        /^(\d+),\s*0,\s*1,\s*\d+/,
        `$1, 0, 1, ${level}`
      );
      // Swap seed
      decoded = decoded.replace(
        /\|\s*2,\s*\d+\s*\|/,
        `| 2, ${seed}|`
      );
      const typeId = decoded.match(/^(\d+)/)?.[1] || "";
      return {
        slot, category: "Weapon", itemName: `${weaponDisplayName} (Godroll)`, manufacturer: mfg,
        weaponType, decoded, typeId, confidence: "exact",
        notes: `From godroll: ${godroll.name}`,
      };
    }
  }

  // ── STEP 2: Fall back to DB assembly ─────────────────────────────────
  let barrelRow: UniversalRow | undefined;
  let rarityRow: UniversalRow | undefined;

  if (slug) {
    rarityRow = db.find(r =>
      r.category === "Weapon" && r.partType === "Rarity" &&
      r.internalName?.toLowerCase().includes(`legendary_${slug}`)
    );
    barrelRow = db.find(r =>
      r.category === "Weapon" && r.partType === "Barrel" &&
      r.internalName?.toLowerCase().includes(slug)
    );
  }

  if (!rarityRow) {
    rarityRow = db.find(r =>
      r.category === "Weapon" && r.partType === "Rarity" && r.rarity === "Legendary" &&
      r.manufacturer === mfg && r.weaponType === weaponType
    );
  }

  if (!rarityRow) return null;
  const typeId = parseCode(rarityRow.code).typeId;

  const parts: string[] = [];
  parts.push(`{${parseCode(rarityRow.code).partId}}`);
  if (barrelRow && parseCode(barrelRow.code).typeId === typeId) {
    parts.push(`{${parseCode(barrelRow.code).partId}}`);
  }

  // Augments (licensed parts, manufacturer parts)
  for (const augId of augmentIds) {
    const internalPattern = maxrollAugmentToInternalName(augId);
    const augRow = db.find(r =>
      parseCode(r.code).typeId === typeId &&
      r.internalName?.toLowerCase().includes(internalPattern.toLowerCase())
    );
    if (augRow) parts.push(`{${parseCode(augRow.code).partId}}`);
  }

  // Fill body, grip, mag
  for (const partType of ["Body", "Grip", "Magazine"]) {
    const fill = db.find(r =>
      parseCode(r.code).typeId === typeId && r.partType === partType
    );
    if (fill && parts.length < 10) parts.push(`{${parseCode(fill.code).partId}}`);
  }

  const decoded = `${typeId}, 0, 1, ${level}| 2, ${seed}|| ${parts.join(" ")} |`;
  const name = barrelRow?.partName || rarityRow.partName || `${mfg} ${weaponType}`;

  return {
    slot, category: "Weapon", itemName: name, manufacturer: mfg,
    weaponType, decoded, typeId, confidence: rarityRow ? "exact" : "fuzzy",
  };
}

function assembleMaxrollAccessory(
  db: UniversalRow[], slot: string, category: string, mfg: string,
  legendaryId: string, augmentIds: string[], firmwareId: string,
  level: number, seed: number, rarity: number,
): StockItem | null {
  const slug = extractLegendarySlug(legendaryId);

  // Universal typeIds for each category (firmware/perks live here)
  const universalTypeIds: Record<string, string> = {
    Shield: "246", Grenade: "245", Repkit: "243",
  };
  const uniTypeId = universalTypeIds[category] || "";

  // Find legendary perk or rarity by internalName
  let legRow: UniversalRow | undefined;
  let rarityRow: UniversalRow | undefined;

  if (slug && legendaryId) {
    // Search by internalName for the legendary
    legRow = db.find(r =>
      r.category === category &&
      (r.partType === "Legendary Perk" || r.partType === "Rarity") &&
      r.internalName?.toLowerCase().includes(slug)
    );
    // If not found by internalName, try partName (e.g. "Chrome" for ShinyWarPaint)
    if (!legRow) {
      legRow = db.find(r =>
        r.category === category && r.partType === "Legendary Perk" && r.manufacturer === mfg
      );
    }
    // If we found a legendary perk, also get the rarity row for that manufacturer
    if (legRow && legRow.partType === "Legendary Perk") {
      const legTypeId = parseCode(legRow.code).typeId;
      rarityRow = db.find(r =>
        parseCode(r.code).typeId === legTypeId && r.partType === "Rarity" && r.rarity === "Legendary"
      );
    } else if (legRow && legRow.partType === "Rarity") {
      rarityRow = legRow;
      const legTypeId = parseCode(legRow.code).typeId;
      legRow = db.find(r =>
        parseCode(r.code).typeId === legTypeId && r.partType === "Legendary Perk"
      ) || legRow;
    }
  }

  // Fallback: find by manufacturer
  if (!rarityRow) {
    const rarityName = rarity >= 4 ? "Legendary" : rarity === 3 ? "Epic" : "Rare";
    rarityRow = db.find(r =>
      r.category === category && r.partType === "Rarity" && r.rarity === rarityName && r.manufacturer === mfg
    );
  }

  if (!rarityRow && !legRow) return null;
  const typeId = parseCode((rarityRow || legRow!).code).typeId;

  // All parts stored with full {typeId:partId} format
  const parts: string[] = [];
  if (rarityRow) parts.push(`{${typeId}:${parseCode(rarityRow.code).partId}}`);
  if (legRow && legRow !== rarityRow) parts.push(`{${typeId}:${parseCode(legRow.code).partId}}`);

  // Firmware — lives in the universal typeId (243 for repkit, 245 for grenade, 246 for shield)
  if (firmwareId && uniTypeId) {
    const fwInternal = maxrollFirmwareToInternalName(firmwareId);
    const fwRow = db.find(r =>
      r.category === category && r.partType === "Firmware" &&
      r.internalName?.toLowerCase().includes(fwInternal.replace("part_firmware_", ""))
    );
    if (fwRow) parts.push(`{${parseCode(fwRow.code).typeId}:${parseCode(fwRow.code).partId}}`);
  }

  // Augments / perks — use their actual code (includes correct typeId)
  for (const augId of augmentIds) {
    const internalPattern = maxrollAugmentToInternalName(augId);
    const augRow = db.find(r =>
      r.category === category &&
      r.internalName?.toLowerCase().includes(internalPattern.toLowerCase())
    );
    if (augRow) {
      const { typeId: augTid, partId: augPid } = parseCode(augRow.code);
      parts.push(`{${augTid}:${augPid}}`);
    }
  }

  // Fill generic perks from the universal typeId
  if (uniTypeId) {
    const perkRows = db.filter(r =>
      parseCode(r.code).typeId === uniTypeId && r.partType === "Perk"
    ).slice(0, 3);
    for (const p of perkRows) parts.push(`{${uniTypeId}:${parseCode(p.code).partId}}`);
  }

  const decodedFinal = `${typeId}, 0, 1, ${level}| 2, ${seed}|| ${parts.join(" ")} |`;
  const name = legRow?.partName || rarityRow?.partName || `${mfg} ${category}`;

  return {
    slot, category, itemName: name, manufacturer: mfg,
    decoded: decodedFinal, typeId, confidence: legRow ? "exact" : "fuzzy",
  };
}

function assembleMaxrollClassMod(
  db: UniversalRow[], slot: string, character: string, legendaryId: string,
  firmwareId: string, attr: Record<string, unknown>, level: number, seed: number,
): StockItem | null {
  // Class mod typeIds: Amon=255, Harlowe=259, Rafa=256, Vex=254
  const charTypeIds: Record<string, string> = { amon: "255", harlowe: "259", rafa: "256", vex: "254" };
  const typeId = charTypeIds[character.toLowerCase()] || "254";

  const parts: string[] = [];

  // Find legendary rarity and name from legendaryId
  // np_cm_ds_leg_06 → internalName contains "legendary_06"
  const legSuffix = legendaryId.replace(/^np_cm_\w+_/, ""); // "leg_06"
  if (legSuffix) {
    // Rarity: comp_05_legendary_06
    const rarityRow = db.find(r =>
      parseCode(r.code).typeId === typeId && r.partType === "Rarity" &&
      r.internalName?.includes(`legendary_${legSuffix.replace("leg_", "")}`)
    );
    if (rarityRow) parts.push(`{${parseCode(rarityRow.code).partId}}`);

    // Name body: leg_body_06
    const nameRow = db.find(r =>
      parseCode(r.code).typeId === typeId && r.partType === "Name" &&
      r.internalName?.includes(`leg_body_${legSuffix.replace("leg_", "")}`)
    );
    if (nameRow) parts.push(`{${parseCode(nameRow.code).partId}}`);
  }

  // Firmware (class mod firmware is in typeId 234)
  if (firmwareId) {
    const fwInternal = maxrollFirmwareToInternalName(firmwareId);
    const fwRow = db.find(r =>
      r.category === "Class Mod" && r.partType?.includes("Class Mod Perk") &&
      r.internalName?.toLowerCase() === fwInternal.replace("part_", "")
    );
    if (fwRow) parts.push(`{234:${parseCode(fwRow.code).partId}}`);
  }

  // Skill augments
  const skillAugments = (attr.skillAugments || []) as { skillId: string; noOfLevels: number }[];
  for (const sa of skillAugments) {
    // skillId like "grave-thirst" → search for skill with matching slug
    const skillSlug = sa.skillId.replace(/-/g, "_").toLowerCase();
    // Find skill part in class mod for this character
    const skillRow = db.find(r =>
      parseCode(r.code).typeId === typeId && r.partType === "Skill" &&
      (r.internalName?.toLowerCase().includes(skillSlug) ||
       r.partName?.toLowerCase().replace(/[^a-z0-9]/g, "").includes(skillSlug.replace(/_/g, "")))
    );
    if (skillRow) {
      // Add multiple tiers for the number of levels
      parts.push(`{${typeId}:${parseCode(skillRow.code).partId}}`);
    }
  }

  const partsStr = parts.map(p => {
    if (p.match(/^\{\d+:\d+\}$/)) return p;
    return `{${typeId}:${p.replace(/[{}]/g, "")}}`;
  }).join(" ");

  const decoded = `${typeId}, 0, 1, ${level}| 2, ${seed}|| ${partsStr} |`;
  const name = legendaryId ? legendaryId.replace(/^np_/, "").replace(/_/g, " ") : `${character} Class Mod`;

  return {
    slot, category: "Class Mod", itemName: name, manufacturer: character,
    decoded, typeId, confidence: parts.length > 0 ? "exact" : "fuzzy",
  };
}

function assembleMaxrollEnhancement(
  db: UniversalRow[], slot: string, mfg: string, firmwareId: string,
  attr: Record<string, unknown>, level: number, seed: number,
  allEquipment: MaxrollEquipmentSlot[],
  hasBod: boolean = false,
): StockItem | null {
  // Enhancement MFG typeIds
  const enhMfgTypeIds: Record<string, string> = {
    Atlas: "284", COV: "286", Daedalus: "299", Hyperion: "264", Jakobs: "268",
    Maliwan: "271", Ripper: "296", Tediore: "292", Order: "281", Torgue: "303", Vladof: "310",
  };

  // Bod All Rounder rule: force Torgue enhancement with all weapon type perks
  const effectiveMfg = hasBod ? "Torgue" : mfg;
  const mfgTypeId = enhMfgTypeIds[effectiveMfg] || "296";

  const parts: string[] = [];

  // Rarity (legendary = 4)
  const rarity = Number(attr.rarity || 4);
  const rarityName = rarity >= 4 ? "Legendary" : rarity === 3 ? "Epic" : "Rare";
  const rarityRow = db.find(r =>
    parseCode(r.code).typeId === mfgTypeId && r.partType === "Rarity" &&
    r.internalName?.includes(rarityName === "Legendary" ? "legendary" : rarityName.toLowerCase())
  );
  if (rarityRow) parts.push(`{${mfgTypeId}:${parseCode(rarityRow.code).partId}}`);

  // 247 rarity too
  const r247 = db.find(r =>
    parseCode(r.code).typeId === "247" && r.partType === "Rarity" && r.rarity === "Legendary"
  );
  if (r247) parts.push(`{247:${parseCode(r247.code).partId}}`);

  // ── Core perks from enhancement's own manufacturer ───────────────────
  const corePerks = db.filter(r =>
    parseCode(r.code).typeId === mfgTypeId && r.partType === "Core Perk"
  );
  for (const p of corePerks.slice(0, 4)) parts.push(`{${mfgTypeId}:${parseCode(p.code).partId}}`);

  // ── Cross-manufacturer perks from ALL weapons in the build ───────────
  const weaponMfgs = new Set<string>();
  const weaponTypes = new Set<string>();

  for (const eq of allEquipment) {
    if (eq.item.type !== "bl4-weapon") continue;
    const wAttr = eq.item.customAttr;
    const wMfgId = String(wAttr.manufacturerId || "");
    const wMfg = MFG_CAPITALIZE[wMfgId] || wMfgId;
    if (wMfg) weaponMfgs.add(wMfg);
    const wType = WEAPON_TYPE_MAP[String(wAttr.type || "")] || String(wAttr.type || "");
    if (wType) weaponTypes.add(wType.toLowerCase());

    // Also check augments for cross-mfg references (lp-bor = Ripper, lp-tor = Torgue, etc.)
    const augIds = (wAttr.augmentIds || []) as string[];
    for (const aug of augIds) {
      if (aug.startsWith("lp-bor")) weaponMfgs.add("Ripper");
      if (aug.startsWith("lp-tor")) weaponMfgs.add("Torgue");
      if (aug.startsWith("lp-jak")) weaponMfgs.add("Jakobs");
      if (aug.startsWith("lp-ted")) weaponMfgs.add("Tediore");
      if (aug.startsWith("lp-hyp")) weaponMfgs.add("Hyperion");
      if (aug.startsWith("lp-mal")) weaponMfgs.add("Maliwan");
      if (aug.startsWith("lp-dae")) weaponMfgs.add("Daedalus");
      if (aug.startsWith("lp-vla")) weaponMfgs.add("Vladof");
    }
  }

  // Add cross-mfg core perks from each weapon manufacturer's enhancement
  const allEnhCorePerks = db.filter(r => r.category === "Enhancement" && r.partType === "Core Perk");
  const addedMfgTypeIds = new Set([mfgTypeId]); // skip own mfg (already added above)
  for (const wMfg of weaponMfgs) {
    const mfgPerks = allEnhCorePerks.filter(r =>
      r.manufacturer === wMfg && !addedMfgTypeIds.has(parseCode(r.code).typeId)
    );
    if (mfgPerks.length > 0) {
      const crossTypeId = parseCode(mfgPerks[0].code).typeId;
      addedMfgTypeIds.add(crossTypeId);
      for (const p of mfgPerks.slice(0, 4)) {
        parts.push(`{${crossTypeId}:${parseCode(p.code).partId}}`);
      }
    }
  }

  // ── Bod "All Rounder" rule: force ALL weapon types ────────────────────
  if (hasBod) {
    // Bod counts as every weapon type, so add all damage perks
    for (const wt of ["shotgun", "pistol", "smg", "sniper", "assault rifle"]) {
      weaponTypes.add(wt);
    }
    // Ensure Torgue + Daedalus mfg perks are included
    weaponMfgs.add("Torgue");
    weaponMfgs.add("Daedalus");
    // Re-add any cross-mfg perks that were missed
    for (const wMfg of ["Torgue", "Daedalus"]) {
      if (!addedMfgTypeIds.has(enhMfgTypeIds[wMfg] || "")) {
        const mfgPerks = allEnhCorePerks.filter(r =>
          r.manufacturer === wMfg && !addedMfgTypeIds.has(parseCode(r.code).typeId)
        );
        if (mfgPerks.length > 0) {
          const crossTypeId = parseCode(mfgPerks[0].code).typeId;
          addedMfgTypeIds.add(crossTypeId);
          for (const p of mfgPerks.slice(0, 4)) {
            parts.push(`{${crossTypeId}:${parseCode(p.code).partId}}`);
          }
        }
      }
    }
  }

  // ── Weapon-type specific stat perks (247) ────────────────────────────
  const typeStatMap: Record<string, string[]> = {
    "shotgun": ["shotgun dmg", "shotgun damage", "shotgun mag", "shotgun splash", "shotgun crit"],
    "pistol": ["pistol dmg", "pistol damage", "pistol mag", "pistol crit"],
    "smg": ["smg dmg", "smg damage", "smg mag", "smg crit"],
    "sniper": ["sniper dmg", "sniper damage", "sniper mag", "sniper crit"],
    "assault rifle": ["ar dmg", "ar damage", "ar mag", "ar crit", "assault rifle dmg"],
  };

  const statPerks = db.filter(r =>
    parseCode(r.code).typeId === "247" && (r.partType === "Stat Perk" || r.partType === "Stat Group1")
  );
  const addedStatPids = new Set<string>();

  for (const wType of weaponTypes) {
    const searchTerms = typeStatMap[wType] || [`${wType} damage`];
    for (const term of searchTerms) {
      const normTerm = normalize(term);
      const match = statPerks.find(r =>
        !addedStatPids.has(parseCode(r.code).partId) &&
        (normalize(r.partName || "").includes(normTerm) ||
         normalize(r.effect || "").includes(normTerm))
      );
      if (match) {
        const pid = parseCode(match.code).partId;
        addedStatPids.add(pid);
        parts.push(`{247:${pid}}`);
      }
    }
  }

  // ── Universal beneficial stat perks ──────────────────────────────────
  const universalStats = ["gun damage", "gun crit damage", "movement speed", "reload speed"];
  for (const uStat of universalStats) {
    const normU = normalize(uStat);
    const match = statPerks.find(r =>
      !addedStatPids.has(parseCode(r.code).partId) &&
      (normalize(r.partName || "").includes(normU) ||
       normalize(r.effect || "").includes(normU))
    );
    if (match) {
      const pid = parseCode(match.code).partId;
      addedStatPids.add(pid);
      parts.push(`{247:${pid}}`);
    }
  }

  // ── Firmware (in typeId 247) ─────────────────────────────────────────
  if (firmwareId) {
    const fwInternal = maxrollFirmwareToInternalName(firmwareId);
    const fwRow = db.find(r =>
      r.code?.startsWith("{247:") && r.partType === "Stat Perk" &&
      r.internalName?.toLowerCase() === fwInternal.replace("part_", "")
    );
    if (fwRow) parts.push(`{247:${parseCode(fwRow.code).partId}}`);
  }

  // ── Effects from Maxroll (enhancement-19 etc.) ───────────────────────
  const effects = (attr.effect || []) as string[];
  for (const eff of effects) {
    const effNum = eff.replace("enhancement-", "");
    if (/^\d+$/.test(effNum)) {
      parts.push(`{247:${effNum}}`);
    }
  }

  // Stat perks from Maxroll
  const statAugmentIds = (attr.statAugmentIds || []) as string[];
  for (const sa of statAugmentIds) {
    if (/^\d+$/.test(sa)) {
      parts.push(`{247:${sa}}`);
    }
  }

  const partsStr = parts.join(" ");
  const decoded = `${mfgTypeId}, 0, 1, ${level}| 2, ${seed}|| ${partsStr} |`;

  return {
    slot, category: "Enhancement",
    itemName: hasBod ? `${effectiveMfg} Enhancement (Bod All Rounder)` : `${effectiveMfg} Enhancement`,
    manufacturer: effectiveMfg,
    decoded, typeId: mfgTypeId, confidence: "exact",
  };
}
