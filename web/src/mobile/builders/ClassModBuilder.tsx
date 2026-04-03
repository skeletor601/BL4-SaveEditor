import { useState, useMemo, useCallback, useEffect } from "react";
import { useMobileBuilderData } from "../hooks/useMobileBuilderData";
import MobileSelect from "../components/MobileSelect";
import { fetchApi } from "@/lib/apiClient";
import {
  usePartList, useExtraTokens, NumberField, PartChecklist, CodeOutput,
  BuildPartsList, GenerateBar, AddFromDatabase, ExtraTokensList, extraTokensToString, applySkin
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

const CLASS_IDS: Record<string, number> = { Amon: 255, Harlowe: 259, Rafa: 256, Vex: 254, C4SH: 404 };
const PER_CLASS_RARITIES: Record<string, Record<string, number>> = {
  Vex: { Common: 217, Uncommon: 218, Rare: 219, Epic: 220 },
  Rafa: { Common: 66, Uncommon: 67, Rare: 68, Epic: 69 },
  Harlowe: { Common: 224, Uncommon: 223, Rare: 222, Epic: 221 },
  Amon: { Common: 70, Uncommon: 69, Rare: 68, Epic: 67 },
  C4SH: { Common: 52, Uncommon: 53, Rare: 54, Epic: 55 },
};

export default function ClassModBuilder() {
  const { data, loading, error } = useMobileBuilderData<ClassModBuilderData>("accessories/class-mod/builder-data");
  const [className, setClassName] = useState("Amon");
  const [rarity, setRarity] = useState("Legendary");
  const [level, setLevel] = useState(50);
  const [seed, setSeed] = useState(1);
  const [nameCode, setNameCode] = useState("");
  const [skillPoints, setSkillPoints] = useState<Record<string, number>>({});
  const [code, setCode] = useState("");

  const [universalParts, setUniversalParts] = useState<UniversalPartRow[]>([]);

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

  const skills = useMemo(() => data?.skillsByClass[classIdStr] ?? [], [data, classIdStr]);
  const perkOpts = useMemo<PickerOption[]>(() => (data?.perks ?? []).map((p) => ({ value: String(p.perkId), label: `${p.perkId} - ${p.perkNameEN}` })), [data]);
  const fwOpts = useMemo<PickerOption[]>(() => (data?.firmware ?? []).map((f) => ({ value: String(f.partId), label: `${f.partId} - ${f.name}` })), [data]);

  const setSkill = useCallback((name: string, pts: number) => {
    setSkillPoints((prev) => ({ ...prev, [name]: Math.max(0, Math.min(5, pts)) }));
  }, []);

  const generate = useCallback(() => {
    if (!data) return;
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
    setRarity("Legendary"); setNameCode(""); setSkillPoints({}); perks.clear(); fw.clear(); extras.clear(); setCode("");
  }, [perks, fw, extras]);

  if (loading) return <div className="mobile-card" style={{ textAlign: "center", padding: 32 }}>Loading class mod data…</div>;
  if (error || !data) return <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "#ef4444" }}>Error loading data</div>;

  return (
    <div>
      <MobileSelect label="Character" required options={classOpts} value={className} onChange={(v) => { setClassName(v); setNameCode(""); setSkillPoints({}); }} />
      <MobileSelect label="Rarity" required options={rarityOpts} value={rarity} onChange={(v) => { setRarity(v); setNameCode(""); }} />
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <NumberField label="Level" value={level} onChange={setLevel} min={1} max={100} />
        <NumberField label="Seed" value={seed} onChange={setSeed} min={1} max={4096} />
      </div>
      <MobileSelect label="Name" required options={nameOptions} value={nameCode} onChange={setNameCode} placeholder="Select name…" />

      {/* Skills */}
      {skills.length > 0 && (
        <div className="mobile-card">
          <div className="mobile-label">
            Skills
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
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {skills.map((skill) => {
              const pts = skillPoints[skill.skillNameEN] ?? 0;
              return (
                <div key={skill.skillNameEN} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", minHeight: 40 }}>
                  <span style={{ flex: 1, fontSize: 13, color: "var(--color-text)" }}>{skill.skillNameEN}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button type="button" onClick={() => setSkill(skill.skillNameEN, pts - 1)} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid var(--color-panel-border)", background: "rgba(24,28,34,0.85)", color: "var(--color-text)", fontSize: 16, cursor: "pointer", touchAction: "manipulation" }}>−</button>
                    <span style={{ width: 24, textAlign: "center", fontSize: 14, fontWeight: 700, color: pts > 0 ? "var(--color-accent)" : "var(--color-text-muted)" }}>{pts}</span>
                    <button type="button" onClick={() => setSkill(skill.skillNameEN, pts + 1)} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid var(--color-panel-border)", background: "rgba(24,28,34,0.85)", color: "var(--color-text)", fontSize: 16, cursor: "pointer", touchAction: "manipulation" }}>+</button>
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

      <GenerateBar onGenerate={generate} onClear={clearAll} />
      <CodeOutput code={code} onClear={() => setCode("")} />
      <BuildPartsList code={code} universalParts={universalParts} />
    </div>
  );
}
