import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { parse as yamlParse } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import { apiUrl, fetchApi, getApiUnavailableError, isLikelyUnavailable } from "@/lib/apiClient";
import { FLAG_OPTIONS } from "@/components/weapon-toolbox/builderStyles";

interface ClassModNameOption {
  nameCode: number;
  nameEN: string;
}

interface ClassModSkill {
  skillNameEN: string;
  skillIds: number[];
}

interface ClassModPerk {
  perkId: number;
  perkNameEN: string;
}

interface ClassModBuilderData {
  classNames: string[];
  rarities: string[];
  namesByClassRarity: Record<string, ClassModNameOption[]>;
  skillsByClass: Record<string, ClassModSkill[]>;
  perks: ClassModPerk[];
  legendaryMap: Record<string, number>;
  rarityCode: (classKey: string, rarityEn: string) => number | null;
}

const CLASS_IDS: Record<string, number> = {
  Amon: 255,
  Harlowe: 259,
  Rafa: 256,
  Vex: 254,
};

type PerkEntry = { perkId: number; count: number };

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {});
}

/** Build skill icon filename to match desktop (qt_class_mod_editor_tab.py get_skill_icon). */
function getSkillIconFilename(skillNameEN: string, className: string): string {
  const norm = skillNameEN
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['']/g, "")
    .replace(/\s+/g, "_");
  const safeName = norm.replace(/[^a-zA-Z0-9_!]/g, "").toLowerCase();
  const suffixMap: Record<string, string> = { Vex: "_1", Rafa: "_2", Harlowe: "_3", Amon: "_4" };
  const suffix = suffixMap[className] ?? "";
  return `${safeName}${suffix}.png`;
}

function SkillPointControls({
  value,
  maxVal,
  onChange,
}: {
  value: number;
  maxVal: number;
  onChange: (v: number) => void;
}) {
  const setVal = (v: number) => {
    const clamped = Math.max(0, Math.min(maxVal, v));
    onChange(clamped);
  };
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        className="w-9 h-8 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-xs disabled:opacity-40"
        onClick={() => setVal(0)}
        disabled={value <= 0}
        title="Min"
      >
        Min
      </button>
      <button
        type="button"
        className="w-8 h-8 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] disabled:opacity-40"
        onClick={() => setVal(value - 1)}
        disabled={value <= 0}
      >
        −
      </button>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) setVal(n);
        }}
        className="w-10 h-8 text-center rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
      />
      <button
        type="button"
        className="w-8 h-8 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] disabled:opacity-40"
        onClick={() => setVal(value + 1)}
        disabled={value >= maxVal}
      >
        +
      </button>
      <button
        type="button"
        className="w-9 h-8 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-xs disabled:opacity-40"
        onClick={() => setVal(maxVal)}
        disabled={value >= maxVal}
        title="Max"
      >
        Max
      </button>
    </div>
  );
}

export default function ClassModBuilderView() {
  const { saveData, getYamlText, updateSaveData } = useSave();
  const [builderData, setBuilderData] = useState<ClassModBuilderData | null>(null);
  const [className, setClassName] = useState("Amon");
  const [rarity, setRarity] = useState("Legendary");
  const [nameOption, setNameOption] = useState<ClassModNameOption | null>(null);
  const [level, setLevel] = useState("50");
  const [seed, setSeed] = useState(() => String(Math.floor(Math.random() * 9999) + 1));
  const [skillPoints, setSkillPoints] = useState<Record<string, number>>({});
  const [legendarySelected, setLegendarySelected] = useState<number[]>([]);
  const [perkSelected, setPerkSelected] = useState<PerkEntry[]>([]);
  const [perkMultiplier, setPerkMultiplier] = useState(1);
  const [perkSearch, setPerkSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [rawOutput, setRawOutput] = useState("");
  const [b85Output, setB85Output] = useState("");
  const [manualOutputMode, setManualOutputMode] = useState(false);
  const [flagValue, setFlagValue] = useState(3);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<"data" | "encode" | "add" | null>(null);
  const legAvailRef = useRef<HTMLSelectElement>(null);
  const legSelRef = useRef<HTMLSelectElement>(null);
  const perkAvailRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading("data");
    fetchApi("accessories/class-mod/builder-data")
      .then((r) => r.json())
      .then((data: ClassModBuilderData) => {
        if (!cancelled) {
          setBuilderData(data);
          setClassName(data.classNames[0] ?? "Amon");
          setRarity("Legendary");
          setNameOption(null);
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("Failed to load class mod builder data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const classId = CLASS_IDS[className] ?? 255;
  const classIdStr = String(classId);
  const rarityKey = rarity === "Legendary" ? "legendary" : "normal";
  const namesKey = `${classIdStr},${rarityKey}`;
  const nameOptions = builderData?.namesByClassRarity[namesKey] ?? [];
  const skills = builderData?.skillsByClass[classIdStr] ?? [];
  const perksList = builderData?.perks ?? [];
  const isLegendary = rarity === "Legendary";

  // When name options change, reset or set first name
  useEffect(() => {
    if (nameOptions.length > 0 && !nameOption) {
      setNameOption(nameOptions[0]);
    }
    if (nameOptions.length > 0 && nameOption) {
      const still = nameOptions.find((n) => n.nameCode === nameOption.nameCode);
      if (!still) setNameOption(nameOptions[0]);
    }
    if (nameOptions.length === 0) setNameOption(null);
  }, [namesKey, nameOptions.length]);

  const legendaryAvailable = useCallback(() => {
    if (!builderData || !isLegendary) return [];
    const list = nameOptions.filter((n) => n.nameCode !== nameOption?.nameCode);
    return list;
  }, [builderData, isLegendary, nameOptions, nameOption]);

  const legAvail = legendaryAvailable();
  const perkFiltered = perkSearch.trim()
    ? perksList.filter(
        (p) =>
          p.perkNameEN.toLowerCase().includes(perkSearch.toLowerCase()) ||
          String(p.perkId).includes(perkSearch)
      )
    : perksList;
  const skillFiltered = skillSearch.trim()
    ? skills.filter((s) =>
        s.skillNameEN.toLowerCase().includes(skillSearch.toLowerCase())
      )
    : skills;

  const rebuildOutput = useCallback(async () => {
    if (manualOutputMode || !builderData) return;
    if (!nameOption) {
      setRawOutput("...");
      setB85Output("...");
      return;
    }
    const levelVal = level.trim() || "50";
    const header = `${classId}, 0, 1, ${levelVal}| 2, ${seed}||`;
    const parts: string[] = [header];

    // Rarity chunk
    if (isLegendary) {
      const mapKey = `${classIdStr},${nameOption.nameCode}`;
      const itemCardId = builderData.legendaryMap[mapKey];
      if (itemCardId != null) parts.push(`{${itemCardId}}`);
    } else {
      const rc = builderData.rarityCode(className, rarity);
      if (rc != null) parts.push(`{${rc}}`);
    }

    // Name chunk
    parts.push(`{${nameOption.nameCode}}`);
    if (isLegendary && className === "Harlowe") parts.push("{27}");

    // Legendary extras (other names)
    for (const code of legendarySelected) {
      parts.push(`{${code}}`);
    }

    // Skills
    for (const skill of skills) {
      const points = skillPoints[skill.skillNameEN] ?? 0;
      if (points > 0) {
        const ids = skill.skillIds.slice(0, points);
        for (const id of ids) parts.push(`{${id}}`);
      }
    }

    // Perks: {234:[ ... ]}
    const perkIds: number[] = [];
    for (const { perkId, count } of perkSelected) {
      for (let i = 0; i < count; i++) perkIds.push(perkId);
    }
    if (perkIds.length > 0) {
      parts.push(` {234:[${perkIds.join(" ")}]}`);
    }

    const fullString = parts.join(" ").replace(/\s+/g, " ").trim() + "|";
    setRawOutput(fullString);

    setLoading("encode");
    try {
      const res = await fetchApi("save/encode-serial", {
        method: "POST",
        body: JSON.stringify({ decoded_string: fullString }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && typeof data?.serial === "string") {
        setB85Output(data.serial);
      } else {
        setB85Output("");
      }
    } catch {
      setB85Output("");
    } finally {
      setLoading(null);
    }
  }, [
    manualOutputMode,
    builderData,
    className,
    classId,
    classIdStr,
    level,
    seed,
    rarity,
    isLegendary,
    nameOption,
    legendarySelected,
    skillPoints,
    skills,
    perkSelected,
  ]);

  useEffect(() => {
    if (!builderData) return;
    rebuildOutput();
  }, [builderData, rebuildOutput]);

  const handleRawChange = (v: string) => {
    setRawOutput(v);
    setManualOutputMode(true);
  };
  const handleB85Change = (v: string) => {
    setB85Output(v);
    setManualOutputMode(true);
  };

  const handleEncodeFromRaw = useCallback(async () => {
    const decoded = rawOutput.trim();
    if (!decoded) {
      setMessage("Enter a decoded string first.");
      return;
    }
    setLoading("encode");
    setMessage(null);
    try {
      const res = await fetchApi("save/encode-serial", {
        method: "POST",
        body: JSON.stringify({ decoded_string: decoded }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && typeof data?.serial === "string") {
        setB85Output(data.serial);
        setMessage("Encoded.");
      } else {
        setMessage(data?.error ?? "Encode failed");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [rawOutput]);

  const handleDecodeFromB85 = useCallback(async () => {
    const serial = b85Output.trim();
    if (!serial.startsWith("@U")) {
      setMessage("Paste a Base85 serial (must start with @U).");
      return;
    }
    setLoading("encode");
    setMessage(null);
    try {
      const res = await fetchApi("save/decode-items", {
        method: "POST",
        body: JSON.stringify({ serials: [serial] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(isLikelyUnavailable(res) ? getApiUnavailableError() : (data?.error ?? "Decode failed"));
        return;
      }
      const items = data?.items ?? [];
      const first = items[0];
      if (first?.error) {
        setMessage(first.error);
        return;
      }
      if (typeof first?.decodedFull === "string") {
        setRawOutput(first.decodedFull);
        setMessage("Decoded.");
      } else {
        setMessage("No decoded string in response.");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [b85Output]);

  const handleAddToBackpack = useCallback(async () => {
    const serial = b85Output.trim();
    if (!serial.startsWith("@U")) {
      setMessage("Encode a serial first, or paste a Base85 serial.");
      return;
    }
    if (!saveData) {
      setMessage("Load a save first (Character → Select Save).");
      return;
    }
    const yamlContent = getYamlText();
    if (!yamlContent.trim()) {
      setMessage("No save YAML loaded.");
      return;
    }
    setLoading("add");
    setMessage(null);
    try {
      const res = await fetchApi("save/add-item", {
        method: "POST",
        body: JSON.stringify({
          yaml_content: yamlContent,
          serial,
          flag: String(flagValue),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(isLikelyUnavailable(res) ? getApiUnavailableError() : (data?.error ?? "Add failed"));
        return;
      }
      if (data?.success && typeof data?.yaml_content === "string") {
        const parsed = yamlParse(data.yaml_content) as Record<string, unknown>;
        updateSaveData(parsed);
        setMessage("Class mod added to backpack. Use Overwrite save on Select Save to export.");
      } else {
        setMessage(data?.error ?? "Add failed");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [b85Output, saveData, flagValue, getYamlText, updateSaveData]);

  const addLegendary = () => {
    const sel = legAvailRef.current;
    if (!sel?.selectedOptions?.length) return;
    const codes = Array.from(sel.selectedOptions).map((o) => Number((o as HTMLOptionElement).value));
    setLegendarySelected((prev) => [...prev, ...codes.filter(Number.isFinite)]);
  };
  const removeLegendary = () => {
    const sel = legSelRef.current;
    if (!sel?.selectedOptions?.length) return;
    const codes = new Set(Array.from(sel.selectedOptions).map((o) => Number((o as HTMLOptionElement).value)));
    setLegendarySelected((prev) => prev.filter((c) => !codes.has(c)));
  };
  const clearLegendary = () => setLegendarySelected([]);

  const addPerks = () => {
    const sel = perkAvailRef.current;
    if (!sel?.selectedOptions?.length) return;
    const mult = perkMultiplier;
    const toAdd = Array.from(sel.selectedOptions).map((o) => Number((o as HTMLOptionElement).value));
    setPerkSelected((prev) => {
      const next = [...prev];
      for (const pid of toAdd) {
        if (!Number.isFinite(pid)) continue;
        const ex = next.find((e) => e.perkId === pid);
        if (ex) ex.count += mult;
        else next.push({ perkId: pid, count: mult });
      }
      return next;
    });
  };
  const perkSelRef = useRef<HTMLSelectElement>(null);
  const removePerkSelected = () => {
    const sel = perkSelRef.current;
    if (!sel?.selectedOptions?.length) return;
    const selectedIndices = new Set(Array.from(sel.selectedOptions).map((o) => Number((o as HTMLOptionElement).value)));
    setPerkSelected((prev) => prev.filter((_, i) => !selectedIndices.has(i)));
  };
  const clearPerks = () => setPerkSelected([]);

  const setSkillPoint = (skillName: string, points: number) => {
    setSkillPoints((prev) => ({ ...prev, [skillName]: Math.max(0, Math.min(5, points)) }));
  };

  if (loading === "data" || !builderData) {
    return (
      <div className="text-[var(--color-text-muted)]">
        {loading === "data" ? "Loading class mod data…" : "Class mod builder data not available."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-muted)]">
        Build a class mod: class, rarity, name, level, seed, legendary additions, skills (0–5 points), and perks.
      </p>

      {/* Top: Class, Rarity, Name, Level, Seed */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div>
          <label className="text-xs text-[var(--color-text-muted)] block mb-1">Class</label>
          <select
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)]"
          >
            {builderData.classNames.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--color-text-muted)] block mb-1">Rarity</label>
          <select
            value={rarity}
            onChange={(e) => setRarity(e.target.value)}
            className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)]"
          >
            {builderData.rarities.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--color-text-muted)] block mb-1">Name</label>
          <select
            value={nameOption?.nameCode ?? ""}
            onChange={(e) => {
              const code = parseInt(e.target.value, 10);
              const opt = nameOptions.find((n) => n.nameCode === code);
              setNameOption(opt ?? null);
            }}
            className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)]"
          >
            {nameOptions.map((n) => (
              <option key={n.nameCode} value={n.nameCode}>{n.nameEN}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--color-text-muted)] block mb-1">Level</label>
          <input
            type="text"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)]"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--color-text-muted)] block mb-1">Seed</label>
          <div className="flex gap-1">
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)]"
            />
            <button
              type="button"
              onClick={() => setSeed(String(Math.floor(Math.random() * 9999) + 1))}
              className="px-2 py-2 rounded border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)]"
              title="Random seed"
            >
              🎲
            </button>
          </div>
        </div>
      </section>

      {/* Legendary Additions */}
      <section className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
        <h3 className="text-[var(--color-accent)] font-medium mb-2">Legendary Additions</h3>
        {!isLegendary && (
          <p className="text-sm text-[var(--color-text-muted)]">Select Legendary rarity to add other legendary names.</p>
        )}
        {isLegendary && (
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
            <div>
              <label className="text-xs text-[var(--color-text-muted)] block mb-1">Available</label>
              <select
                ref={legAvailRef}
                multiple
                size={8}
                className="w-full px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)]"
              >
                {legAvail.map((n) => (
                  <option key={n.nameCode} value={n.nameCode}>{n.nameEN} {`{${n.nameCode}}`}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 pt-6">
              <button type="button" onClick={addLegendary} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-[var(--color-text)]">»</button>
              <button type="button" onClick={removeLegendary} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-[var(--color-text)]">«</button>
              <button type="button" onClick={clearLegendary} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-[var(--color-text)]">Clear</button>
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-muted)] block mb-1">Selected</label>
              <select
                ref={legSelRef}
                multiple
                size={8}
                className="w-full px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
              >
                {legendarySelected.map((code) => {
                  const n = nameOptions.find((o) => o.nameCode === code) ?? legAvail.find((o) => o.nameCode === code);
                  const label = n ? `${n.nameEN} {${code}}` : `{${code}}`;
                  return <option key={code} value={code}>{label}</option>;
                })}
              </select>
            </div>
          </div>
        )}
      </section>

      {/* Output */}
      <section className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
        <h3 className="text-[var(--color-accent)] font-medium mb-2">Output</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Decoded</label>
            <textarea
              value={rawOutput}
              onChange={(e) => handleRawChange(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono resize-y"
            />
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => copyToClipboard(rawOutput)} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm">Copy</button>
              <button type="button" onClick={handleEncodeFromRaw} disabled={loading !== null} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm disabled:opacity-50">Encode</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Base85</label>
            <textarea
              value={b85Output}
              onChange={(e) => handleB85Change(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono resize-y"
            />
            <div className="flex flex-wrap gap-2 mt-1 items-center">
              <button type="button" onClick={handleDecodeFromB85} disabled={loading !== null} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm disabled:opacity-50">Deserialize</button>
              <select
                value={flagValue}
                onChange={(e) => setFlagValue(Number(e.target.value))}
                className="px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
              >
                {FLAG_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button type="button" onClick={handleAddToBackpack} disabled={loading !== null || !saveData} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm disabled:opacity-50">Add to backpack</button>
              {!saveData && (
                <Link to="/character/select-save" className="text-sm text-[var(--color-accent)] hover:underline">
                  Load a save first
                </Link>
              )}
            </div>
          </div>
        </div>
        {message && <p className="mt-2 text-sm text-[var(--color-text-muted)]">{message}</p>}
      </section>

      {/* Skills */}
      <section className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
        <h3 className="text-[var(--color-accent)] font-medium mb-2">Skills</h3>
        <input
          type="text"
          placeholder="Search..."
          value={skillSearch}
          onChange={(e) => setSkillSearch(e.target.value)}
          className="w-full max-w-xs mb-3 px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)]"
        />
        <div className="max-h-[400px] overflow-auto space-y-2">
          {skillFiltered.map((skill) => {
            const iconFilename = getSkillIconFilename(skill.skillNameEN, className);
            const iconSrc = apiUrl(`accessories/class-mod/skill-icon/${className}/${iconFilename}`);
            return (
            <div key={skill.skillNameEN} className="flex flex-wrap items-center gap-2 py-1 border-b border-[var(--color-panel-border)] last:border-0">
              <img
                src={iconSrc}
                alt=""
                className="w-8 h-8 object-contain flex-shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <span className="w-40 md:w-52 truncate text-[var(--color-text)]" title={skill.skillNameEN}>{skill.skillNameEN}</span>
              <span className="text-xs text-[var(--color-text-muted)]">{`{${skill.skillIds.slice(0, 5).join(", ")}}`}</span>
              <SkillPointControls
                value={skillPoints[skill.skillNameEN] ?? 0}
                maxVal={Math.min(5, skill.skillIds.length)}
                onChange={(v) => setSkillPoint(skill.skillNameEN, v)}
              />
            </div>
            );
          })}
        </div>
      </section>

      {/* Perks */}
      <section className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
        <h3 className="text-[var(--color-accent)] font-medium mb-2">Perks</h3>
        <input
          type="text"
          placeholder="Search..."
          value={perkSearch}
          onChange={(e) => setPerkSearch(e.target.value)}
          className="w-full max-w-xs mb-3 px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)]"
        />
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Available</label>
            <select
              ref={perkAvailRef}
              multiple
              size={10}
              className="w-full px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)]"
            >
              {perkFiltered.map((p) => (
                <option key={p.perkId} value={p.perkId}>[{p.perkId}] {p.perkNameEN}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 pt-6">
            <input
              type="number"
              min={1}
              max={999}
              value={perkMultiplier}
              onChange={(e) => setPerkMultiplier(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-14 px-1 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-center"
            />
            <button type="button" onClick={addPerks} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-[var(--color-text)]">»</button>
            <button type="button" onClick={removePerkSelected} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-[var(--color-text)]">«</button>
            <button type="button" onClick={clearPerks} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-[var(--color-text)]">Clear</button>
          </div>
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Selected</label>
            <select
              ref={perkSelRef}
              multiple
              size={10}
              className="w-full px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
            >
              {perkSelected.map((e, i) => {
                const p = perksList.find((x) => x.perkId === e.perkId);
                const label = `(${e.count}) [${e.perkId}] ${p?.perkNameEN ?? e.perkId}`;
                return (
                  <option key={`${e.perkId}-${i}`} value={i}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}
