import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseCsv } from "./csvParse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

function getPath(relative: string): string {
  return join(repoRoot, relative);
}

function readCsv(path: string): { headers: string[]; rows: Record<string, string>[] } {
  const content = readFileSync(path, "utf-8");
  return parseCsv(content);
}

export interface WeaponEditPartRow {
  mfgWtId: string;
  manufacturer: string;
  weaponType: string;
  partId: string;
  partType: string;
  string: string;
  stat: string;
}

export interface WeaponEditElementalRow {
  elementalId: string;
  partId: string;
  stat: string;
}

export interface WeaponEditData {
  /** Flat list of all weapon parts (CSV + merged from universal). */
  parts: WeaponEditPartRow[];
  /** Elemental rows from elemental.csv (with Elemental_ID + Part_ID). */
  elemental: WeaponEditElementalRow[];
}

function parseCodePair(code: string): { prefix: number; part: number } | null {
  const s = String(code ?? "").trim();
  const m2 = s.match(/^\{\s*(\d+)\s*:\s*(\d+)\s*\}$/);
  if (m2) return { prefix: Number(m2[1]), part: Number(m2[2]) };
  const m1 = s.match(/^\{\s*(\d+)\s*\}$/);
  if (m1) {
    const n = Number(m1[1]);
    return { prefix: n, part: n };
  }
  return null;
}

function loadWeaponEditParts(): WeaponEditPartRow[] {
  const enPath = getPath("weapon_edit/all_weapon_part_EN.csv");
  const path = existsSync(enPath) ? enPath : getPath("weapon_edit/all_weapon_part.csv");
  if (!existsSync(path)) return [];
  const { rows } = readCsv(path);

  const parts: WeaponEditPartRow[] = rows.map((r) => ({
    mfgWtId: String(r["Manufacturer & Weapon Type ID"] ?? "").trim(),
    manufacturer: String(r["Manufacturer"] ?? "").trim(),
    weaponType: String(r["Weapon Type"] ?? "").trim(),
    partId: String(r["Part ID"] ?? "").trim().replace("<NA>", ""),
    partType: String(r["Part Type"] ?? "").trim(),
    string: String(r["String"] ?? "").trim(),
    stat: String(r["Stat"] ?? "").trim(),
  }));

  // Merge in any missing weapon parts from universal_parts_db.json
  const universalPath = getPath("master_search/db/universal_parts_db.json");
  if (existsSync(universalPath)) {
    try {
      const raw = JSON.parse(readFileSync(universalPath, "utf-8"));
      const rowsUni = (raw?.rows ?? []) as Record<string, unknown>[];

      // Map (manufacturer, weaponType) -> mfgWtId from the CSV dataset
      const mfgKeyToId = new Map<string, string>();
      for (const r of parts) {
        if (r.mfgWtId && r.manufacturer && r.weaponType) {
          const key = `${r.manufacturer}\t${r.weaponType}`;
          if (!mfgKeyToId.has(key)) mfgKeyToId.set(key, r.mfgWtId);
        }
      }

      for (const r of rowsUni) {
        const manufacturer = String((r as Record<string, unknown>).Manufacturer ?? "").trim();
        const weaponType =
          String(
            (r as Record<string, unknown>)["Weapon Type"] ??
              (r as Record<string, unknown>).WeaponType ??
              "",
          ).trim();
        const partType = String((r as Record<string, unknown>)["Part Type"] ?? "").trim();
        const partId = String((r as Record<string, unknown>).ID ?? "").trim();
        if (!manufacturer || !weaponType || !partType || !partId) continue;

        const key = `${manufacturer}\t${weaponType}`;
        const mfgWtId = mfgKeyToId.get(key);
        if (!mfgWtId) continue;

        const exists = parts.some(
          (p) => p.mfgWtId === mfgWtId && p.partId === partId && p.partType === partType,
        );
        if (exists) continue;

        const stringVal = String((r as Record<string, unknown>).String ?? "").trim();
        const modelName = String((r as Record<string, unknown>)["Model Name"] ?? "").trim();
        const statCommon = String(
          (r as Record<string, unknown>)["Stats (Level 50, Common)"] ?? "",
        ).trim();
        const stats = String((r as Record<string, unknown>).Stats ?? "").trim();

        parts.push({
          mfgWtId,
          manufacturer,
          weaponType,
          partId,
          partType,
          string: stringVal || modelName || stats || partId,
          stat: statCommon || stats,
        });
      }

      // Also merge non-weapon DB rows so the unified editor can add them directly.
      const specialTypeMap: Record<string, string> = {
        grenade: "Grenade",
        enhancement: "Enhancement",
        shield: "Shield",
        repkit: "Repkit",
        "class mod": "Class Mod",
        classmod: "Class Mod",
      };
      for (const r of rowsUni) {
        const itemType = String((r as Record<string, unknown>)["Item Type"] ?? "").trim().toLowerCase();
        const mappedWeaponType = specialTypeMap[itemType];
        if (!mappedWeaponType) continue;

        const parsed = parseCodePair(String((r as Record<string, unknown>).code ?? ""));
        if (!parsed) continue;

        const defaultPartType =
          mappedWeaponType === "Enhancement"
            ? "Enhancement Part"
            : mappedWeaponType === "Class Mod"
              ? "Class Mod Part"
              : mappedWeaponType === "Repkit"
                ? "Repkit Part"
                : mappedWeaponType === "Shield"
                  ? "Shield Part"
                  : "Grenade Part";
        const partType = String((r as Record<string, unknown>)["Part Type"] ?? "").trim() || defaultPartType;
        const manufacturer = String((r as Record<string, unknown>).Manufacturer ?? "").trim() || mappedWeaponType;
        const partIdFromRow = String((r as Record<string, unknown>).ID ?? "").trim();
        const partId = partIdFromRow || String(parsed.part);
        const weaponType = mappedWeaponType;
        if (!partId) continue;

        const exists = parts.some(
          (p) => p.mfgWtId === String(parsed.prefix) && p.partId === partId && p.partType === partType,
        );
        if (exists) continue;

        const stringVal = String((r as Record<string, unknown>).String ?? "").trim();
        const modelName = String((r as Record<string, unknown>)["Model Name"] ?? "").trim();
        const statCommon = String(
          (r as Record<string, unknown>)["Stats (Level 50, Common)"] ?? "",
        ).trim();
        const stats = String((r as Record<string, unknown>).Stats ?? "").trim();

        parts.push({
          mfgWtId: String(parsed.prefix),
          manufacturer,
          weaponType,
          partId,
          partType,
          string: stringVal || modelName || stats || partId,
          stat: statCommon || stats,
        });
      }
    } catch {
      // Best-effort merge; ignore failures
    }
  }

  return parts;
}

function loadWeaponEditElemental(): WeaponEditElementalRow[] {
  const path = getPath("weapon_edit/elemental.csv");
  if (!existsSync(path)) return [];
  const { rows } = readCsv(path);
  return rows
    .map((r) => ({
      elementalId: String(r["Elemental_ID"] ?? "").trim(),
      partId: String(r["Part_ID"] ?? "").trim(),
      stat: String(r["Stat"] ?? "").trim(),
    }))
    .filter((r) => r.partId);
}

let cached: WeaponEditData | null = null;

export function getWeaponEditData(): WeaponEditData {
  if (cached) return cached;
  const parts = loadWeaponEditParts();
  const elemental = loadWeaponEditElemental();
  cached = { parts, elemental };
  return cached;
}

