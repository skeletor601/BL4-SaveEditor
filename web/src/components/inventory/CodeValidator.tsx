/**
 * Code Validator — pre-flight spawn check for decoded item codes.
 * Paste a decoded string, get green/yellow/red status before loading in-game.
 */
import { useState, useCallback, useMemo } from "react";
import { fetchApi } from "@/lib/apiClient";

interface ValidationResult {
  status: "pass" | "warning" | "fail" | "modded";
  label: string;
  details: string[];
}

interface PartDbEntry {
  code: string;
  partType?: string;
  category?: string;
  manufacturer?: string;
}

// Known weapon prefixes (from weapon_edit CSV)
const WEAPON_PREFIXES = new Set([2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27]);
// Known accessory/cross-insert prefixes
const GRENADE_PREFIXES = new Set([263,267,270,272,278,291,298,311]);
const SHIELD_PREFIXES = new Set([246,248,237,279,283,287,293,300,306,312,321]);
const ENHANCEMENT_PREFIXES = new Set([247,264,268,271,275,281,282,284,286,289,292,296,299,303,310]);
const CLASS_MOD_PREFIXES = new Set([234,254,255,256,259]);
const ELEMENTAL_PREFIX = 1;

function parseHeader(decoded: string): { prefix: number; version: number; flag: number; level: number; seed: string } | null {
  const m = decoded.trim().match(/^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\|\s*(\d+)\s*,\s*(\d+)\s*\|\|/);
  if (!m) return null;
  return { prefix: Number(m[1]), version: Number(m[2]), flag: Number(m[3]), level: Number(m[4]), seed: m[6]! };
}

interface ParsedToken {
  type: "simple" | "cross" | "grouped" | "elemental";
  prefix: number;
  partId?: number;
  ids?: number[];
  raw: string;
}

function parseTokens(partsStr: string): ParsedToken[] {
  const tokens: ParsedToken[] = [];
  const regex = /\{([^}]+(?:\[[^\]]*\][^}]*)?)\}/g;
  let match;
  while ((match = regex.exec(partsStr)) !== null) {
    const inner = match[1]!;
    const raw = match[0];
    // Grouped: {prefix:[id id id]}
    const groupMatch = inner.match(/^(\d+)\s*:\s*\[([^\]]*)\]$/);
    if (groupMatch) {
      const prefix = Number(groupMatch[1]);
      const ids = groupMatch[2]!.trim().split(/\s+/).map(Number).filter((n) => Number.isFinite(n));
      tokens.push({ type: "grouped", prefix, ids, raw });
      continue;
    }
    // Cross-prefix: {prefix:partId}
    const crossMatch = inner.match(/^(\d+)\s*:\s*(\d+)$/);
    if (crossMatch) {
      const prefix = Number(crossMatch[1]);
      const partId = Number(crossMatch[2]);
      if (prefix === ELEMENTAL_PREFIX) {
        tokens.push({ type: "elemental", prefix, partId, raw });
      } else {
        tokens.push({ type: "cross", prefix, partId, raw });
      }
      continue;
    }
    // Simple: {partId}
    const simpleMatch = inner.match(/^(\d+)$/);
    if (simpleMatch) {
      tokens.push({ type: "simple", prefix: 0, partId: Number(simpleMatch[1]), raw });
      continue;
    }
  }
  return tokens;
}

function validateCode(decoded: string, partsDb: PartDbEntry[]): ValidationResult[] {
  const results: ValidationResult[] = [];

  // 1. Header check
  const header = parseHeader(decoded);
  if (!header) {
    results.push({ status: "fail", label: "Header", details: ["Invalid header format. Expected: prefix, 0, 1, level| 2, seed||"] });
    return results;
  }

  if (header.level < 1 || header.level > 50) {
    results.push({ status: "warning", label: "Level", details: [`Level ${header.level} is outside normal range (1-50)`] });
  } else {
    results.push({ status: "pass", label: "Level", details: [`Level ${header.level}`] });
  }

  const isWeapon = WEAPON_PREFIXES.has(header.prefix);
  const isGrenade = GRENADE_PREFIXES.has(header.prefix);
  const isShield = SHIELD_PREFIXES.has(header.prefix);

  if (isWeapon) {
    results.push({ status: "pass", label: "Item Type", details: [`Weapon (prefix ${header.prefix})`] });
  } else if (isGrenade) {
    results.push({ status: "pass", label: "Item Type", details: [`Grenade (prefix ${header.prefix})`] });
  } else if (isShield) {
    results.push({ status: "pass", label: "Item Type", details: [`Shield (prefix ${header.prefix})`] });
  } else {
    results.push({ status: "warning", label: "Item Type", details: [`Unknown prefix ${header.prefix} — may be valid for accessories`] });
  }

  // 2. Parse tokens
  const partsMatch = decoded.match(/\|\|\s*(.+?)\s*\|/);
  if (!partsMatch?.[1]) {
    results.push({ status: "fail", label: "Parts", details: ["No parts found between || and |"] });
    return results;
  }

  const tokens = parseTokens(partsMatch[1]);
  if (tokens.length === 0) {
    results.push({ status: "fail", label: "Parts", details: ["No valid tokens parsed"] });
    return results;
  }

  results.push({ status: "pass", label: "Token Count", details: [`${tokens.length} tokens parsed`] });

  // 3. Stock parts check (weapons)
  if (isWeapon) {
    const simpleTokens = tokens.filter((t) => t.type === "simple");
    const explicitOwnPrefix = tokens.filter((t) => (t.type === "cross" || t.type === "grouped") && t.prefix === header.prefix);
    const stockPartCount = simpleTokens.length + explicitOwnPrefix.length;

    if (stockPartCount >= 10) {
      results.push({ status: "pass", label: "Stock Base", details: [`${stockPartCount} stock parts (simple + own-prefix)`] });
    } else if (stockPartCount >= 5) {
      results.push({ status: "warning", label: "Stock Base", details: [`Only ${stockPartCount} stock parts — some slots may be missing. Recommend 10+`] });
    } else {
      results.push({ status: "fail", label: "Stock Base", details: [`Only ${stockPartCount} stock parts — weapon likely won't spawn. Need body, barrel, magazine, grip, scope, etc.`] });
    }

    // Check for rarity
    const hasRarity = tokens.some((t) => {
      if (t.type === "simple") {
        // Check if this partId is a rarity for this prefix in the DB
        const match = partsDb.find((p) => p.code === `{${header.prefix}:${t.partId}}` && p.partType?.toLowerCase() === "rarity");
        return !!match;
      }
      return false;
    }) || tokens.some((t) => t.type === "cross" && t.partId && t.partId >= 80 && t.partId <= 100);

    if (hasRarity) {
      results.push({ status: "pass", label: "Rarity", details: ["Rarity token detected"] });
    } else {
      results.push({ status: "warning", label: "Rarity", details: ["No clear rarity token found — may use default"] });
    }
  }

  // 4. Element check
  const elementTokens = tokens.filter((t) => t.type === "elemental");
  const validElements = new Set([55, 56, 57, 58, 59, 60]);
  const hasValidElement = elementTokens.some((t) => t.partId && validElements.has(t.partId));
  if (elementTokens.length > 0) {
    if (hasValidElement) {
      const names: Record<number, string> = { 55: "Kinetic", 56: "Shock", 57: "Radiation", 58: "Corrosive", 59: "Cryo", 60: "Fire" };
      const found = elementTokens.map((t) => names[t.partId!] ?? `ID:${t.partId}`);
      results.push({ status: "pass", label: "Element", details: [`Elements: ${found.join(", ")}`] });
    } else {
      results.push({ status: "warning", label: "Element", details: [`${elementTokens.length} element token(s) but none are standard IDs (56-60)`] });
    }
  }

  // 5. COV Magazine check
  const hasCov = tokens.some((t) => {
    if (t.type === "simple" && isWeapon) {
      const match = partsDb.find((p) => p.code === `{${header.prefix}:${t.partId}}`);
      return match && /cov/i.test(match.manufacturer ?? "") && match.partType?.toLowerCase() === "magazine";
    }
    return false;
  });
  if (hasCov) {
    results.push({ status: "warning", label: "COV Magazine", details: ["COV magazine detected — may override Vladof magazine and prevent grenade reload"] });
  }

  // 6. Modded detection
  const crossPrefixes = new Set(tokens.filter((t) => t.type === "cross" || t.type === "grouped").map((t) => t.prefix));
  const moddedSigns: string[] = [];
  if ([...crossPrefixes].some((p) => CLASS_MOD_PREFIXES.has(p))) moddedSigns.push("Class Mod perks");
  if ([...crossPrefixes].some((p) => SHIELD_PREFIXES.has(p) && isWeapon)) moddedSigns.push("Shield cross-insert");
  if ([...crossPrefixes].some((p) => ENHANCEMENT_PREFIXES.has(p))) moddedSigns.push("Enhancement cross-insert");
  if (crossPrefixes.has(245) || tokens.some((t) => t.type === "grouped" && t.prefix === 245)) moddedSigns.push("Grenade perk block");
  if (crossPrefixes.has(289) && isWeapon) moddedSigns.push("Heavy barrel accessories");

  if (moddedSigns.length > 0) {
    results.push({ status: "modded", label: "Modded Content", details: [`Detected: ${moddedSigns.join(", ")}`] });
  }

  // 7. Grenade block check
  const grenadeTokens = tokens.filter((t) => t.type === "grouped" && t.prefix === 245);
  if (grenadeTokens.length > 0) {
    const totalIds = grenadeTokens.reduce((sum, t) => sum + (t.ids?.length ?? 0), 0);
    results.push({ status: "pass", label: "Grenade Kit", details: [`${grenadeTokens.length} block(s), ${totalIds} total perk IDs`] });
  }

  // 8. Skin check
  const skinMatch = decoded.match(/"c"\s*,\s*"([^"]+)"/);
  if (skinMatch) {
    results.push({ status: "pass", label: "Skin", details: [skinMatch[1]!] });
  }

  return results;
}

export default function CodeValidator() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<ValidationResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [partsDb, setPartsDb] = useState<PartDbEntry[]>([]);

  const handleValidate = useCallback(async () => {
    const decoded = input.trim();
    if (!decoded) return;

    setLoading(true);
    try {
      // Load parts DB if not cached
      let db = partsDb;
      if (db.length === 0) {
        try {
          const res = await fetchApi("parts/data");
          if (res.ok) {
            const data = await res.json();
            const items = Array.isArray(data?.items) ? data.items : Array.isArray(data?.rows) ? data.rows : [];
            db = items.map((r: Record<string, unknown>) => ({
              code: String(r.code ?? r.Code ?? "").trim(),
              partType: String(r.partType ?? r["Part Type"] ?? "").trim(),
              category: String(r.category ?? r.Category ?? "").trim(),
              manufacturer: String(r.manufacturer ?? r.Manufacturer ?? "").trim(),
            }));
            setPartsDb(db);
          }
        } catch { /* proceed without DB */ }
      }

      setResults(validateCode(decoded, db));
    } finally {
      setLoading(false);
    }
  }, [input, partsDb]);

  const overallStatus = useMemo(() => {
    if (!results) return null;
    if (results.some((r) => r.status === "fail")) return "fail";
    if (results.some((r) => r.status === "modded")) return "modded";
    if (results.some((r) => r.status === "warning")) return "warning";
    return "pass";
  }, [results]);

  const statusConfig = {
    pass: { label: "Ready to Spawn", color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10", icon: "✓" },
    warning: { label: "May Have Issues", color: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-500/10", icon: "⚠" },
    fail: { label: "Will Not Spawn", color: "text-red-400", border: "border-red-500/40", bg: "bg-red-500/10", icon: "✕" },
    modded: { label: "Modded — Check Details", color: "text-purple-400", border: "border-purple-500/40", bg: "bg-purple-500/10", icon: "◈" },
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--color-panel-border)] overflow-hidden" style={{ backgroundColor: "rgba(18, 21, 27, 0.8)" }}>
        <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--color-accent)]">Code Validator</h3>
            <p className="text-[10px] text-[var(--color-text-muted)]">Pre-flight spawn check — paste a decoded string to verify before loading in-game</p>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
            Beta
          </span>
        </div>

        <div className="p-4 space-y-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste decoded string here... e.g. 20, 0, 1, 50| 2, 420|| {11:82} {62} {4} ..."
            className="w-full h-24 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[var(--color-text)] text-xs font-mono resize-y focus:border-[var(--color-accent)] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleValidate}
            disabled={loading || !input.trim()}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-sm font-medium hover:bg-[var(--color-accent)]/30 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manipulation"
          >
            {loading ? "Checking..." : "Validate Code"}
          </button>
        </div>

        {overallStatus && results && (
          <div className="px-4 pb-4 space-y-3">
            {/* Overall status banner */}
            <div className={`rounded-lg border ${statusConfig[overallStatus].border} ${statusConfig[overallStatus].bg} px-4 py-3 flex items-center gap-3`}>
              <span className={`text-2xl ${statusConfig[overallStatus].color}`}>{statusConfig[overallStatus].icon}</span>
              <div>
                <div className={`text-sm font-bold ${statusConfig[overallStatus].color}`}>{statusConfig[overallStatus].label}</div>
                <div className="text-[10px] text-[var(--color-text-muted)]">{results.length} checks performed</div>
              </div>
            </div>

            {/* Individual check results */}
            <div className="rounded-lg border border-[var(--color-panel-border)] divide-y divide-[var(--color-panel-border)]/50 overflow-hidden">
              {results.map((r, i) => {
                const cfg = statusConfig[r.status];
                return (
                  <div key={i} className="px-3 py-2 flex items-start gap-3">
                    <span className={`text-xs font-bold mt-0.5 ${cfg.color}`}>{cfg.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-[var(--color-text)]">{r.label}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${cfg.border} ${cfg.bg} ${cfg.color}`}>
                          {r.status}
                        </span>
                      </div>
                      {r.details.map((d, j) => (
                        <p key={j} className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{d}</p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
