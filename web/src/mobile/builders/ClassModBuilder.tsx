import { useState, useMemo, useCallback, useEffect } from "react";
import { useMobileBuilderData } from "../hooks/useMobileBuilderData";
import MobileSelect from "../components/MobileSelect";
import { fetchApi, apiUrl } from "@/lib/apiClient";
import { getClassModNameInfo } from "@/data/classModNameDescriptions";
import {
  usePartList, useExtraTokens, NumberField, PartChecklist, CodeOutput,
  BuildPartsList, AddFromDatabase, ExtraTokensList, extraTokensToString, applySkin
} from "./shared";
import type { PickerOption } from "../components/MobilePicker";

interface ClassModNameOption { nameCode: number; nameEN: string; }
interface ClassModSkill { skillNameEN: string; skillIds: number[]; }
interface ClassModPerk { perkId: number; perkNameEN: string; }
interface ClassModFirmware { partId: number; name: string; description?: string; }
interface ClassModBuilderData {
  classNames: string[];
  rarities: string[];
  namesByClassRarity: Record<string, ClassModNameOption[]>;
  skillsByClass: Record<string, ClassModSkill[]>;
  perks: ClassModPerk[];
  firmware: ClassModFirmware[];
  legendaryMap: Record<string, number>;
}

interface UniversalPartRow {
  code: string; label: string; effect?: string; partType?: string;
  category?: string; manufacturer?: string;
}

interface SkillDetails {
  name: string;
  type: string;
  description: string;
  stats: string[];
}

const CLASS_IDS: Record<string, number> = { Amon: 255, Harlowe: 259, Rafa: 256, Vex: 254, C4SH: 404 };
const PER_CLASS_RARITIES: Record<string, Record<string, number>> = {
  Vex: { Common: 217, Uncommon: 218, Rare: 219, Epic: 220 },
  Rafa: { Common: 66, Uncommon: 67, Rare: 68, Epic: 69 },
  Harlowe: { Common: 224, Uncommon: 223, Rare: 222, Epic: 221 },
  Amon: { Common: 70, Uncommon: 69, Rare: 68, Epic: 67 },
  C4SH: { Common: 52, Uncommon: 53, Rare: 54, Epic: 55 },
};

const CHARACTER_COLORS: Record<string, string> = {
  Amon: "#fdba74", Harlowe: "#67e8f9", Rafa: "#86efac", Vex: "#c4b5fd", C4SH: "#fca5a5",
};

const C4SH_BLUE_SKILLS = new Set([
  "Ace in the Hole","Alchemy","Ante","Around the Corner","Bad Men Must Bleed",
  "Bone Shrapnel","Boom or Bust","C4SH Game","Dealer's Bluff","Double-Down",
  "Fortuity","Grave Pact","Heart of the Cards","Hero Call","High Roller",
  "Hot Streak","Late Scratch","Legerdemain","Payout","Read the Signs",
  "Running Luck","Sounds of Rain","Stack the Deck","Steam","Table Flip",
  "Take the Pot","The House","The Turn","Trick-Taker","Wretched Shadows",
]);
const C4SH_RED_SKILLS = new Set([
  "Blood on Elpis","Brimstone","Broken Arrow","Cottonmouth","Death Hunt",
  "Debts to Pay","Forsaken","Gunslinger","Hard-Boiled","Hell and Back",
  "Lawless","Maverick","Pale Rider","Ride to Ruin","Shootist",
  "Stand and Bleed","TNT","The Claim","The Determinator","The Furies",
  "The Gunfighter","The Wind","Unchained","War Wagon","Witching Hour",
]);
const C4SH_GREEN_SKILLS = new Set([
  "All for One","Alpha's Call","Critical Role","Cursed Call","Devil's Tines",
  "Double Time","Fortune's Favor","Graveyard Shift","Haunted","High Stakes",
  "Let it Ride","Loaded Dice","Luck Be a Robot","Luckless","Lucky Charm",
  "Pack Mentality","Red Moon Rising","Riding High","Risky Business",
  "Rolling the Deep","Serendipity","Shadow's Embrace","Sidekick's Revenge",
  "Snake Eyes","Spin of Fate","The Lucky One","The Wilds","Undying",
]);

function getSkillIconFilename(skillNameEN: string, className: string): string {
  const norm = skillNameEN
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['']/g, "")
    .replace(/\s+/g, "_");
  const safeName = norm.replace(/[^a-zA-Z0-9_!]/g, "").toLowerCase();
  const suffixMap: Record<string, string> = { Vex: "_1", Rafa: "_2", Harlowe: "_3", Amon: "_4", C4SH: "_5" };
  const suffix = suffixMap[className] ?? "";
  return `${safeName}${suffix}.png`;
}

function getC4SHSkillColor(skillName: string): string | null {
  if (C4SH_BLUE_SKILLS.has(skillName)) return "#60a5fa";
  if (C4SH_RED_SKILLS.has(skillName)) return "#f87171";
  if (C4SH_GREEN_SKILLS.has(skillName)) return "#4ade80";
  return null;
}

function getC4SHSkillIconBg(skillName: string): string {
  if (C4SH_BLUE_SKILLS.has(skillName)) return "rgba(59,130,246,0.35)";
  if (C4SH_RED_SKILLS.has(skillName)) return "rgba(239,68,68,0.35)";
  if (C4SH_GREEN_SKILLS.has(skillName)) return "rgba(34,197,94,0.35)";
  return "transparent";
}

// ── Name Description Popup ──────────────────────────────────────────────────

function NameDescriptionPopup({ nameEN, onClose }: { nameEN: string; onClose: () => void }) {
  const info = getClassModNameInfo(nameEN);
  if (!info) return null;
  const color = CHARACTER_COLORS[info.character] ?? "#fff";
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ width: "100%", maxWidth: 380, borderRadius: 16, border: `2px solid ${color}44`, background: "rgba(18,21,27,0.97)", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "3px 8px", borderRadius: 12, border: `1px solid ${color}66`, background: `${color}22`, color }}>{info.character}</span>
            <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--color-text-muted)", fontSize: 18, cursor: "pointer", padding: "2px 6px" }}>×</button>
          </div>
          <p style={{ fontSize: 16, fontWeight: 700, color, marginBottom: 12, lineHeight: 1.3 }}>{nameEN}</p>
          <div style={{ borderRadius: 10, border: "1px solid var(--color-panel-border)", background: "rgba(0,0,0,0.3)", padding: 12 }}>
            <p style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--color-text-muted)", marginBottom: 6 }}>Class Mod Effect</p>
            <p style={{ fontSize: 13, color: "var(--color-text)", lineHeight: 1.5 }}>{info.description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Skill Detail Popup ──────────────────────────────────────────────────────

function SkillDetailPopup({ skillName, className, onClose }: { skillName: string; className: string; onClose: () => void }) {
  const [details, setDetails] = useState<SkillDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false);
    const params = new URLSearchParams({ class: className, name: skillName });
    fetchApi(`accessories/class-mod/skill-details?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: SkillDetails) => { if (!cancelled) setDetails(data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [skillName, className]);

  const iconFilename = getSkillIconFilename(skillName, className);
  const iconSrc = apiUrl(`accessories/class-mod/skill-icon/${className}/${iconFilename}`);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ width: "100%", maxWidth: 380, borderRadius: 16, border: "2px solid var(--color-panel-border)", background: "rgba(24,28,34,0.98)", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 12px 0" }}>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, padding: "4px 10px", borderRadius: 8, border: "1px solid var(--color-panel-border)", background: "rgba(0,0,0,0.3)", color: "var(--color-text)" }}>
            {details?.type || "Skill"}
          </span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--color-text-muted)", fontSize: 18, cursor: "pointer", padding: "2px 8px" }}>×</button>
        </div>
        <div style={{ padding: "8px 12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 48, height: 48, flexShrink: 0, borderRadius: 6,
              border: "1px solid var(--color-panel-border)", overflow: "hidden",
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: className === "C4SH" ? getC4SHSkillIconBg(skillName) : "transparent",
            }}>
              <img
                src={iconSrc}
                alt=""
                style={{
                  width: "100%", height: "100%", objectFit: "contain",
                  filter: className === "C4SH" ? "brightness(0) invert(1)" : "none",
                }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text)", lineHeight: 1.2 }}>{skillName}</h2>
          </div>
          {loading && <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Loading...</p>}
          {error && <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Could not load skill details.</p>}
          {details && !loading && (
            <div style={{ borderRadius: 12, border: "2px solid var(--color-panel-border)", padding: 12 }}>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--color-text-muted)", marginBottom: 6 }}>Effect / Stats</p>
              <p style={{ fontSize: 13, color: "var(--color-text)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{details.description}</p>
              {details.stats && details.stats.length > 0 && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--color-text)" }}>
                  {details.stats.map((line, i) => <li key={i} style={{ marginBottom: 2 }}>{line}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Builder ────────────────────────────────────────────────────────────

export default function ClassModBuilder() {
  const { data, loading, error } = useMobileBuilderData<ClassModBuilderData>("accessories/class-mod/builder-data");
  const [className, setClassName] = useState("Amon");
  const [rarity, setRarity] = useState("Legendary");
  const [level, setLevel] = useState(50);
  const [seed, setSeed] = useState(1);
  const [nameCode, setNameCode] = useState("");
  const [skillPoints, setSkillPoints] = useState<Record<string, number>>({});
  const [code, setCode] = useState("");
  const [skillSearch, setSkillSearch] = useState("");

  const [universalParts, setUniversalParts] = useState<UniversalPartRow[]>([]);

  // Popup state
  const [namePopup, setNamePopup] = useState<string | null>(null);
  const [skillPopup, setSkillPopup] = useState<string | null>(null);

  const perks = usePartList();
  const fw = usePartList();
  const extras = useExtraTokens();

  useEffect(() => {
    fetchApi("parts/data").then((r) => r.json()).then((d) => {
      if (d?.items) setUniversalParts(d.items.map((i: Record<string, unknown>) => ({
        code: String(i.code ?? ""), label: String(i.partName ?? i.itemType ?? ""),
        effect: String(i.effect ?? ""), partType: String(i.partType ?? ""),
        category: String(i.category ?? ""), manufacturer: String(i.manufacturer ?? ""),
      })));
    }).catch(() => {});
  }, []);

  const classId = CLASS_IDS[className] ?? 255;
  const classIdStr = String(classId);

  const classOpts = useMemo<PickerOption[]>(() => (data?.classNames ?? []).map((c) => ({ value: c, label: c })), [data]);
  const rarityOpts = useMemo<PickerOption[]>(() => (data?.rarities ?? []).map((r) => ({ value: r, label: r })), [data]);

  const nameKey = rarity === "Legendary" ? `${classIdStr},legendary` : `${classIdStr},normal`;
  const nameOptions = useMemo<PickerOption[]>(() => {
    const names = data?.namesByClassRarity[nameKey] ?? [];
    return names.map((n) => ({ value: String(n.nameCode), label: `${n.nameCode} - ${n.nameEN}` }));
  }, [data, nameKey]);

  // Find name EN from current nameCode
  const selectedNameEN = useMemo(() => {
    const names = data?.namesByClassRarity[nameKey] ?? [];
    const found = names.find((n) => String(n.nameCode) === nameCode);
    return found?.nameEN ?? null;
  }, [data, nameKey, nameCode]);

  const skills = useMemo(() => data?.skillsByClass[classIdStr] ?? [], [data, classIdStr]);
  const filteredSkills = useMemo(() => {
    if (!skillSearch.trim()) return skills;
    const q = skillSearch.trim().toLowerCase();
    return skills.filter((s) => s.skillNameEN.toLowerCase().includes(q));
  }, [skills, skillSearch]);

  const perkOpts = useMemo<PickerOption[]>(() => (data?.perks ?? []).map((p) => ({ value: String(p.perkId), label: `${p.perkId} - ${p.perkNameEN}` })), [data]);
  const fwOpts = useMemo<PickerOption[]>(() => (data?.firmware ?? []).map((f) => ({ value: String(f.partId), label: `${f.partId} - ${f.name}${f.description ? `, ${f.description}` : ""}` })), [data]);

  const setSkill = useCallback((name: string, pts: number) => {
    setSkillPoints((prev) => ({ ...prev, [name]: Math.max(0, Math.min(5, pts)) }));
  }, []);

  useEffect(() => {
    if (!data) return;
    if (!rarity || !nameCode) { setCode(""); return; }
    const header = `${classId}, 0, 1, ${level}| 2, ${seed}||`;
    const p: string[] = [];

    const nc = nameCode ? parseInt(nameCode, 10) : null;

    // Rarity
    if (rarity === "Legendary") {
      if (nc != null) {
        const mapKey = `${classIdStr},${nc}`;
        const itemCardId = data.legendaryMap?.[mapKey];
        if (itemCardId != null) p.push(`{${itemCardId}}`);
      }
    } else {
      const rc = PER_CLASS_RARITIES[className]?.[rarity];
      if (rc != null) p.push(`{${rc}}`);
    }

    // Name
    if (nc != null) p.push(`{${nc}}`);

    // Harlowe special case
    if (rarity === "Legendary" && className === "Harlowe") p.push("{27}");

    // Firmware (234:partId)
    for (const f of fw.parts) {
      const id = parseInt(f.id, 10);
      if (!Number.isFinite(id)) continue;
      for (let i = 0; i < f.qty; i++) p.push(`{234:${id}}`);
    }

    // Skills
    for (const skill of skills) {
      const pts = Math.max(0, Math.min(5, skillPoints[skill.skillNameEN] ?? 0));
      if (pts <= 0) continue;
      const ids = skill.skillIds.slice(0, pts);
      for (const id of ids) {
        if (Number.isFinite(id)) p.push(`{${id}}`);
      }
    }

    // Perks (grouped as 234:[...])
    const perkIds: number[] = [];
    for (const perk of perks.parts) {
      const id = parseInt(perk.id, 10);
      if (!Number.isFinite(id)) continue;
      for (let i = 0; i < perk.qty; i++) perkIds.push(id);
    }
    if (perkIds.length > 0) p.push(`{234:[${perkIds.join(" ")}]}`);

    let decoded = applySkin(`${header} ${p.join(" ")} |`, "");
    const extra = extraTokensToString(extras.tokens);
    if (extra) decoded = decoded.replace(/\s*\|\s*$/, ` ${extra} |`);
    setCode(decoded);
  }, [data, classId, classIdStr, className, rarity, level, seed, nameCode, skillPoints, skills, fw.parts, perks.parts, extras.tokens]);

  const clearAll = useCallback(() => {
    setRarity("Legendary"); setNameCode(""); setSkillPoints({}); perks.clear(); fw.clear(); extras.clear(); setCode(""); setSkillSearch("");
  }, [perks, fw, extras]);

  if (loading) return <div className="mobile-card" style={{ textAlign: "center", padding: 32 }}>Loading class mod data...</div>;
  if (error || !data) return <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "#ef4444" }}>Error loading data</div>;

  const charColor = CHARACTER_COLORS[className] ?? "var(--color-accent)";

  return (
    <div>
      <MobileSelect label="Character" required options={classOpts} value={className} onChange={(v) => { setClassName(v); setNameCode(""); setSkillPoints({}); setSkillSearch(""); }} />
      <MobileSelect label="Rarity" required options={rarityOpts} value={rarity} onChange={(v) => { setRarity(v); setNameCode(""); }} />
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <NumberField label="Level" value={level} onChange={setLevel} min={1} max={100} />
        <NumberField label="Seed" value={seed} onChange={setSeed} min={1} max={4096} />
      </div>
      <MobileSelect label="Name" required options={nameOptions} value={nameCode} onChange={setNameCode} placeholder="Select name..." />

      {/* Name description button */}
      {selectedNameEN && getClassModNameInfo(selectedNameEN) && (
        <button
          type="button"
          onClick={() => setNamePopup(selectedNameEN)}
          style={{
            width: "100%", marginBottom: 14, padding: "10px 14px", borderRadius: 10,
            border: `1px solid ${charColor}44`, background: `${charColor}11`,
            color: charColor, fontSize: 12, fontWeight: 600, cursor: "pointer",
            touchAction: "manipulation", textAlign: "left", lineHeight: 1.4,
          }}
        >
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.7 }}>Tap for details: </span>
          {selectedNameEN}
          <span style={{ float: "right", opacity: 0.5 }}>i</span>
        </button>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <div className="mobile-card">
          <div className="mobile-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Skills ({skills.length})</span>
            <button
              type="button"
              onClick={() => {
                const next: Record<string, number> = {};
                skills.forEach((s) => { next[s.skillNameEN] = 5; });
                setSkillPoints(next);
              }}
              style={{ marginLeft: "auto", background: "none", border: "1px solid var(--color-accent)", borderRadius: 6, color: "var(--color-accent)", fontSize: 10, padding: "3px 8px", cursor: "pointer", touchAction: "manipulation" }}
            >
              Max All
            </button>
            <button
              type="button"
              onClick={() => setSkillPoints({})}
              style={{ background: "none", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 6, color: "#ef4444", fontSize: 10, padding: "3px 8px", cursor: "pointer", touchAction: "manipulation" }}
            >
              Clear
            </button>
          </div>

          {/* Skill search */}
          <input
            type="text"
            className="mobile-input"
            placeholder="Search skills..."
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
            style={{ marginBottom: 8, fontSize: 12 }}
          />

          <div style={{ maxHeight: 400, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {filteredSkills.map((skill) => {
              const pts = skillPoints[skill.skillNameEN] ?? 0;
              const iconFilename = getSkillIconFilename(skill.skillNameEN, className);
              const iconSrc = apiUrl(`accessories/class-mod/skill-icon/${className}/${iconFilename}`);
              const skillColor = className === "C4SH" ? getC4SHSkillColor(skill.skillNameEN) : null;

              return (
                <div key={skill.skillNameEN} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", minHeight: 44 }}>
                  {/* Skill icon */}
                  <div style={{
                    width: 32, height: 32, flexShrink: 0, borderRadius: 4,
                    border: "1px solid var(--color-panel-border)",
                    overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                    backgroundColor: className === "C4SH" ? getC4SHSkillIconBg(skill.skillNameEN) : "transparent",
                  }}>
                    <img
                      src={iconSrc}
                      alt=""
                      style={{
                        width: "100%", height: "100%", objectFit: "contain",
                        filter: className === "C4SH" ? "brightness(0) invert(1)" : "none",
                      }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                  {/* Skill name + IDs (tappable for details) */}
                  <button
                    type="button"
                    onClick={() => setSkillPopup(skill.skillNameEN)}
                    style={{
                      flex: 1, background: "none", border: "none", padding: 0, cursor: "pointer",
                      textAlign: "left", touchAction: "manipulation",
                    }}
                  >
                    <span style={{
                      fontSize: 13, fontWeight: 600,
                      color: skillColor ?? "var(--color-text)",
                      textDecoration: "underline",
                      textDecorationColor: "rgba(255,255,255,0.15)",
                      textUnderlineOffset: 2,
                    }}>
                      {skill.skillNameEN}
                    </span>
                    <span style={{ display: "block", fontSize: 10, color: "var(--color-text-muted)", fontWeight: 400, marginTop: 2 }}>
                      {`{${skill.skillIds.join(", ")}}`}
                    </span>
                  </button>
                  {/* Level controls: Min / - / input / + / Max */}
                  <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => setSkill(skill.skillNameEN, 0)}
                      disabled={pts <= 0}
                      style={{
                        width: 28, height: 28, borderRadius: 5,
                        border: "1px solid var(--color-panel-border)",
                        background: pts > 0 ? "rgba(24,28,34,0.85)" : "rgba(24,28,34,0.4)",
                        color: pts > 0 ? "var(--color-text-muted)" : "rgba(255,255,255,0.15)",
                        fontSize: 8, fontWeight: 700, cursor: pts > 0 ? "pointer" : "default",
                        touchAction: "manipulation",
                      }}
                    >
                      Min
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkill(skill.skillNameEN, pts - 1)}
                      disabled={pts <= 0}
                      style={{
                        width: 28, height: 28, borderRadius: 5,
                        border: "1px solid var(--color-panel-border)",
                        background: pts > 0 ? "rgba(24,28,34,0.85)" : "rgba(24,28,34,0.4)",
                        color: pts > 0 ? "var(--color-text)" : "rgba(255,255,255,0.15)",
                        fontSize: 16, cursor: pts > 0 ? "pointer" : "default",
                        touchAction: "manipulation",
                      }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={pts}
                      min={0}
                      max={5}
                      onChange={(e) => setSkill(skill.skillNameEN, Number(e.target.value) || 0)}
                      style={{
                        width: 32, height: 28, textAlign: "center", fontSize: 14, fontWeight: 700,
                        borderRadius: 5, border: "1px solid var(--color-panel-border)",
                        background: "rgba(24,28,34,0.85)",
                        color: pts > 0 ? "var(--color-accent)" : "var(--color-text-muted)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setSkill(skill.skillNameEN, pts + 1)}
                      disabled={pts >= 5}
                      style={{
                        width: 28, height: 28, borderRadius: 5,
                        border: "1px solid var(--color-panel-border)",
                        background: pts < 5 ? "rgba(24,28,34,0.85)" : "rgba(24,28,34,0.4)",
                        color: pts < 5 ? "var(--color-text)" : "rgba(255,255,255,0.15)",
                        fontSize: 16, cursor: pts < 5 ? "pointer" : "default",
                        touchAction: "manipulation",
                      }}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkill(skill.skillNameEN, 5)}
                      disabled={pts >= 5}
                      style={{
                        width: 28, height: 28, borderRadius: 5,
                        border: "1px solid var(--color-panel-border)",
                        background: pts < 5 ? "rgba(24,28,34,0.85)" : "rgba(24,28,34,0.4)",
                        color: pts < 5 ? "var(--color-text-muted)" : "rgba(255,255,255,0.15)",
                        fontSize: 8, fontWeight: 700, cursor: pts < 5 ? "pointer" : "default",
                        touchAction: "manipulation",
                      }}
                    >
                      Max
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <PartChecklist label="Firmware" options={fwOpts} selected={fw.parts} onToggle={fw.toggle} onQtyChange={fw.setQty} />
      <PartChecklist label="Perks" options={perkOpts} selected={perks.parts} onToggle={perks.toggle} onQtyChange={perks.setQty} />

      <AddFromDatabase universalParts={universalParts} onAdd={extras.add} />
      <ExtraTokensList tokens={extras.tokens} onRemove={extras.remove} />

      <button type="button" className="mobile-btn danger" onClick={clearAll} style={{ marginBottom: 14 }}>Clear All</button>
      <CodeOutput code={code} onClear={() => setCode("")} />
      <BuildPartsList code={code} universalParts={universalParts} />

      {/* Popups */}
      {namePopup && <NameDescriptionPopup nameEN={namePopup} onClose={() => setNamePopup(null)} />}
      {skillPopup && <SkillDetailPopup skillName={skillPopup} className={className} onClose={() => setSkillPopup(null)} />}
    </div>
  );
}
