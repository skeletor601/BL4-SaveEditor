import { useState, useEffect, useMemo, useCallback } from "react";
import { fetchApi } from "@/lib/apiClient";
import MobileSelect from "../components/MobileSelect";
import { showToast } from "../components/Toast";

interface PartRow {
  code: string;
  label: string;
  effect?: string;
  manufacturer?: string;
  partType?: string;
  rarity?: string;
  category?: string;
  weaponType?: string;
}

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "Weapon", label: "Weapon" },
  { value: "Shield", label: "Shield" },
  { value: "Grenade", label: "Grenade" },
  { value: "Repkit", label: "RepKit" },
  { value: "Heavy", label: "Heavy" },
  { value: "Enhancement", label: "Enhancement" },
  { value: "Class Mod", label: "Class Mod" },
  { value: "Element", label: "Element" },
];

const RARITIES = [
  { value: "", label: "All Rarities" },
  { value: "Common", label: "Common" },
  { value: "Uncommon", label: "Uncommon" },
  { value: "Rare", label: "Rare" },
  { value: "Epic", label: "Epic" },
  { value: "Legendary", label: "Legendary" },
  { value: "Pearl", label: "Pearl" },
];

const rarityColor = (r?: string) => {
  const rl = (r ?? "").toLowerCase();
  if (rl === "pearl" || rl === "pearlescent") return "#38bdf8";
  if (rl === "legendary") return "#fbbf24";
  if (rl === "epic") return "#a78bfa";
  if (rl === "rare") return "#60a5fa";
  if (rl === "uncommon") return "#4ade80";
  return "var(--color-text)";
};

export default function MobileSearchPage() {
  const [allParts, setAllParts] = useState<PartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [rarity, setRarity] = useState("");
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("parts/data")
      .then((r) => r.json())
      .then((d: { items?: Record<string, unknown>[] }) => {
        if (!d.items) return;
        setAllParts(
          d.items.map((raw) => ({
            code: String(raw.code ?? ""),
            label: String(raw.partName ?? raw.itemType ?? ""),
            effect: String(raw.effect ?? ""),
            manufacturer: String(raw.manufacturer ?? ""),
            partType: String(raw.partType ?? ""),
            rarity: String(raw.rarity ?? ""),
            category: String(raw.category ?? ""),
            weaponType: String(raw.weaponType ?? ""),
          })).filter((p) => p.code)
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const mfgOptions = useMemo(() => {
    const mfgs = [...new Set(allParts.map((p) => p.manufacturer).filter((m): m is string => !!m))].sort();
    return [{ value: "", label: "All Manufacturers" }, ...mfgs.map((m) => ({ value: m, label: m }))];
  }, [allParts]);
  const [mfg, setMfg] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allParts.filter((p) => {
      if (category && p.category !== category) return false;
      if (rarity && p.rarity?.toLowerCase() !== rarity.toLowerCase()) return false;
      if (mfg && p.manufacturer !== mfg) return false;
      if (!q) return true;
      return [p.code, p.label, p.effect ?? "", p.manufacturer ?? "", p.partType ?? "", p.weaponType ?? ""]
        .join(" ").toLowerCase().includes(q);
    });
  }, [allParts, search, category, rarity, mfg]);

  // Show max 100 results for performance
  const displayed = filtered.slice(0, 100);

  const handleCopy = useCallback((code: string) => {
    navigator.clipboard.writeText(code).then(() => showToast("Code copied!")).catch(() => showToast("Copy failed"));
  }, []);

  return (
    <div>
      <div className="mobile-page-header">
        <h1>Parts Database</h1>
        <p>{allParts.length} parts loaded</p>
      </div>

      <input
        type="text"
        className="mobile-input"
        placeholder="Search parts…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      <MobileSelect label="Category" options={CATEGORIES} value={category} onChange={setCategory} />
      <MobileSelect label="Manufacturer" options={mfgOptions} value={mfg} onChange={setMfg} />
      <MobileSelect label="Rarity" options={RARITIES} value={rarity} onChange={setRarity} />

      {loading && <div className="mobile-card" style={{ textAlign: "center", padding: 32 }}>Loading parts…</div>}

      {!loading && (
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8 }}>
          {filtered.length} results{filtered.length > 100 ? " (showing first 100)" : ""}
        </div>
      )}

      {displayed.map((part) => {
        const expanded = expandedCode === part.code;
        return (
          <div key={part.code} className="mobile-card" style={{ padding: 0, overflow: "hidden", marginBottom: 6 }}>
            <button
              type="button"
              onClick={() => setExpandedCode(expanded ? null : part.code)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "10px 12px", background: "none", border: "none",
                color: "var(--color-text)", fontSize: 13, textAlign: "left",
                cursor: "pointer", touchAction: "manipulation", minHeight: 44,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--color-accent)", opacity: 0.6, flexShrink: 0, minWidth: 52 }}>
                {part.code}
              </span>
              <span style={{ flex: 1, color: rarityColor(part.rarity), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
                {part.label}
              </span>
              <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{expanded ? "▲" : "▼"}</span>
            </button>

            {expanded && (
              <div style={{ padding: "0 12px 12px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, marginBottom: 8 }}>
                  {part.category && <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "2px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "var(--color-text-muted)" }}>{part.category}</span>}
                  {part.partType && <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "2px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "var(--color-text-muted)" }}>{part.partType}</span>}
                  {part.manufacturer && <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "2px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "var(--color-text-muted)" }}>{part.manufacturer}</span>}
                  {part.rarity && <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "2px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: rarityColor(part.rarity) }}>{part.rarity}</span>}
                  {part.weaponType && <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "2px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "var(--color-text-muted)" }}>{part.weaponType}</span>}
                </div>
                {part.effect && <p style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.4, marginBottom: 8 }}>{part.effect}</p>}
                <button type="button" className="mobile-btn" onClick={() => handleCopy(part.code)}>
                  Copy Code
                </button>
              </div>
            )}
          </div>
        );
      })}

      {!loading && filtered.length === 0 && (
        <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "var(--color-text-muted)" }}>
          No parts found
        </div>
      )}
    </div>
  );
}
