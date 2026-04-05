/**
 * Maxroll Build Planner Scraper
 * Extracts fully structured build data from maxroll.gg/borderlands-4/planner URLs.
 *
 * Maxroll stores EVERYTHING in window.__remixContext:
 * - Skills with exact point allocations
 * - Specializations with point distribution
 * - Equipment with manufacturer, weapon type, legendary name, augments, firmware
 * - Notes with build guide text
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface MaxrollSkills {
  skillPoints: Record<string, number>;
  actionSkill: string;
  augment: string;
  augment2: string;
  augment3: string;
}

export interface MaxrollSpecializations {
  skillPoints: Record<string, number>;
  active: string[];
}

export interface MaxrollWeapon {
  _id: string;
  type: string; // "bl4-weapon"
  customAttr: {
    type: string; // "shotgun", "smg", "sniper", etc.
    rarity: number;
    level: number;
    manufacturerId: string;
    augmentIds: string[];
    elementalDamage?: Record<string, { dps: number; chance: number }>;
    legendaryId?: string;
    legendaryAugmentIds?: string[];
    firmwareId?: string;
    accuracy?: number;
    damage?: number;
    fireRate?: number;
    magazineSize?: number;
    projectileNumber?: number;
    reloadSpeed?: number;
    splashRadius?: number;
    ammoPerShot?: number;
  };
}

export interface MaxrollAccessory {
  _id: string;
  type: string; // "bl4-shield", "bl4-class-mod", "bl4-enhancement", "bl4-ordnance", "bl4-repkit"
  customAttr: {
    type?: string;
    rarity: number;
    level: number;
    manufacturerId?: string;
    augmentIds?: string[];
    firmwareId?: string;
    legendaryId?: string;
    legendaryAugmentIds?: string[];
    statAugmentIds?: string[];
    effect?: string[];
    skillAugments?: { skillId: string; noOfLevels: number }[];
    character?: string;
    statAugments?: string[];
  };
}

export interface MaxrollBuild {
  id: string;
  skills: MaxrollSkills;
  specializations: MaxrollSpecializations;
  equipment: Record<string, string>; // slot -> item ID
}

export interface MaxrollPlannerData {
  character: string;
  builds: MaxrollBuild[];
  items: Record<string, MaxrollWeapon | MaxrollAccessory>;
  notes?: unknown;
  author?: { contentCreator: string };
}

export interface ScrapedMaxrollBuild {
  plannerName: string;
  character: string;
  author: string;
  url: string;
  plannerData: MaxrollPlannerData;
  skills: MaxrollSkills;
  specializations: MaxrollSpecializations;
  equipment: {
    slot: string;
    itemId: string;
    item: MaxrollWeapon | MaxrollAccessory;
  }[];
}

// ── Scraper ─────────────────────────────────────────────────────────────────

export async function scrapeMaxroll(url: string): Promise<ScrapedMaxrollBuild> {
  // Validate URL
  const maxrollMatch = url.match(/maxroll\.gg\/borderlands-4\/planner\/([a-zA-Z0-9]+)/);
  if (!maxrollMatch) {
    throw new Error("Invalid Maxroll URL. Expected: maxroll.gg/borderlands-4/planner/XXXXX");
  }

  // Fetch the page
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) throw new Error(`Failed to fetch Maxroll page: ${res.status}`);
  const html = await res.text();

  // Extract __remixContext
  const remixMatch = html.match(/window\.__remixContext\s*=\s*(\{.*?\});/s);
  if (!remixMatch) throw new Error("Could not find __remixContext in page");

  const remixData = JSON.parse(remixMatch[1]);
  const loaderData = remixData?.state?.loaderData?.["borderlands-4-planner-by-id"];
  if (!loaderData) throw new Error("Could not find planner data in remix context");

  const profile = loaderData.profile;
  if (!profile?.data) throw new Error("No build data in profile");

  const plannerData: MaxrollPlannerData = typeof profile.data === "string"
    ? JSON.parse(profile.data)
    : profile.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planner = (plannerData as any).planner ?? plannerData;
  const build = (planner as { builds?: MaxrollBuild[] }).builds?.[0];
  if (!build) throw new Error("No builds found in planner data");

  const items = (planner as { items?: Record<string, MaxrollWeapon | MaxrollAccessory> }).items ?? {};

  // Map equipment slots to items
  const equipment: { slot: string; itemId: string; item: MaxrollWeapon | MaxrollAccessory }[] = [];
  for (const [slot, itemId] of Object.entries(build.equipment)) {
    const item = items[itemId];
    if (item) equipment.push({ slot, itemId, item });
  }

  return {
    plannerName: profile.name || "Maxroll Build",
    character: (planner as { character?: string }).character || loaderData.metadata?.character || "",
    author: (planner as { author?: { contentCreator: string } }).author?.contentCreator || loaderData.metadata?.author?.contentCreator || "",
    url,
    plannerData: planner as MaxrollPlannerData,
    skills: build.skills,
    specializations: build.specializations,
    equipment,
  };
}
