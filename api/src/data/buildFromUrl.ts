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
  const statMatches = statSection.match(/(Shotgun|Gun|Weapon|Melee|Skill|Sniper|SMG|Splash)\s+(Damage|Crit Damage|Mag Size|Magazine Size|Equip Speed|Fire Rate|Reload Speed|damage)/gi);
  if (statMatches) {
    for (const s of statMatches) enhancementStats.push(s.trim());
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

  const elementName = elementCode
    ? ELEMENTS.find(e => e.code === elementCode)?.name || ""
    : "";

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
  context: BuildContext,
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

    // Ordnance hint (Penetrator Knife etc)
    if (context.ordnanceHint && normalize(context.ordnanceHint).includes("penetrator")) {
      const penetrator = db.find(r =>
        r.category === "Grenade" && normalize(r.partName || "").includes("penetrator")
      );
      if (penetrator) parts.push(`{245:${parseCode(penetrator.code).partId}}`);
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

    // Enhancement stats from context
    if (context.enhancementStats.length > 0) {
      const statRows = db.filter(r =>
        r.category === "Enhancement" && r.partType === "Stat Perk"
      );
      for (const stat of context.enhancementStats.slice(0, 4)) {
        const normStat = normalize(stat);
        const match = statRows.find(r =>
          normalize(r.partName || "").includes(normStat) ||
          normalize(r.effect || "").includes(normStat)
        );
        if (match) parts.push(`{247:${parseCode(match.code).partId}}`);
      }
    }

    // Enhancement firmware
    const fwParts = resolveFirmware(db, "Enhancement", slotFwTitle, context.firmwareHint);
    for (const fw of fwParts.slice(0, 3)) parts.push(fw);

    // Core perks from manufacturer
    const corePerks = pickParts(db, typeId, "Core Perk", 2);
    for (const p of corePerks) parts.push(`{${p.partId}}`);
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
      const item = assembleAccessory(r, level, firmware, context);
      if (item) items.push(item);
    }
  }

  return { buildName, character, variantName, items, skipped };
}
