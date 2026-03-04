import { useState, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { parse as yamlParse } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import {
  fetchApi,
  getApiUnavailableError,
  isLikelyUnavailable,
} from "@/lib/apiClient";

const NONE = "None";
const FLAG_OPTIONS = [
  { value: 1, label: "1 (Normal)" },
  { value: 3, label: "3 (Favorite)" },
  { value: 5, label: "5 (Junk)" },
  { value: 17, label: "17 (Group1)" },
  { value: 33, label: "33 (Group2)" },
  { value: 65, label: "65 (Group3)" },
  { value: 129, label: "129 (Group4)" },
];

const MULTI_SLOTS: Record<string, number> = {
  "Body Accessory": 4,
  "Barrel Accessory": 4,
  "Manufacturer Part": 4,
  "Scope Accessory": 4,
  "Underbarrel Accessory": 3,
};

interface WeaponGenData {
  manufacturers: string[];
  weaponTypes: string[];
  mfgWtIdList: { manufacturer: string; weaponType: string; mfgWtId: string }[];
  partsByMfgTypeId: Record<
    string,
    Record<string, { partId: string; label: string }[]>
  >;
  rarityByMfgTypeId: Record<
    string,
    { partId: string; stat: string; description?: string }[]
  >;
  legendaryByMfgTypeId: Record<
    string,
    { partId: string; description: string }[]
  >;
  elemental: { partId: string; stat: string }[];
  godrolls: { name: string; decoded: string }[];
  skins: { label: string; value: string }[];
}

function partIdFromLabel(label: string): string | null {
  if (!label || label === NONE) return null;
  const first = label.split(" - ")[0]?.trim();
  if (first && /^\d+$/.test(first)) return first;
  return null;
}

export default function WeaponGenView() {
  const navigate = useNavigate();
  const { saveData, getYamlText, updateSaveData } = useSave();
  const [data, setData] = useState<WeaponGenData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [manufacturer, setManufacturer] = useState("");
  const [weaponType, setWeaponType] = useState("");
  const [level, setLevel] = useState("50");
  const [seed, setSeed] = useState(() =>
    String(Math.floor(100 + Math.random() * 9900))
  );
  const [partSelections, setPartSelections] = useState<Record<string, string>>(
    {}
  );
  const [skinToken, setSkinToken] = useState<string | null>(null);
  const [skinComboValue, setSkinComboValue] = useState("");
  const [flagValue, setFlagValue] = useState(3);

  const [decodedDisplay, setDecodedDisplay] = useState("");
  const [encodedSerial, setEncodedSerial] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<"encode" | "add" | null>(null);
  const [godRollModalOpen, setGodRollModalOpen] = useState(false);
  const [godRollSelectedIndex, setGodRollSelectedIndex] = useState(0);

  const mfgWtId =
    data?.mfgWtIdList.find(
      (e) => e.manufacturer === manufacturer && e.weaponType === weaponType
    )?.mfgWtId ?? null;

  useEffect(() => {
    if (!data?.mfgWtIdList?.length || mfgWtId) return;
    setManufacturer(data.mfgWtIdList[0].manufacturer);
    setWeaponType(data.mfgWtIdList[0].weaponType);
  }, [data?.mfgWtIdList, mfgWtId]);

  useEffect(() => {
    setPartSelections({});
  }, [mfgWtId]);

  useEffect(() => {
    let cancelled = false;
    fetchApi("weapon-gen/data")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setData(d);
          const list = d.mfgWtIdList ?? [];
          if (list.length > 0) {
            setManufacturer(list[0].manufacturer);
            setWeaponType(list[0].weaponType);
          } else if (d.manufacturers?.length) setManufacturer(d.manufacturers[0]);
          if (d.weaponTypes?.length && !list.length) setWeaponType(d.weaponTypes[0]);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load weapon data. Is the API running?");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const buildDecoded = useCallback(() => {
    if (!mfgWtId) return "";
    const lvl = /^\d+$/.test(level) ? level : "50";
    const sd = /^\d+$/.test(seed) ? seed : String(Math.floor(100 + Math.random() * 9900));
    let header = `${mfgWtId}, 0, 1, ${lvl}| 2, ${sd}||`;
    const parts: string[] = [];

    const raritySel = partSelections["Rarity"];
    const isLegendary = raritySel === "Legendary";
    if (isLegendary) {
      const legSel = partSelections["Legendary Type"];
      const pid = partIdFromLabel(legSel ?? "");
      if (pid) parts.push(`{${pid}}`);
    } else if (raritySel && raritySel !== NONE) {
      const entry = data?.rarityByMfgTypeId[mfgWtId]?.find((r) => r.stat === raritySel);
      if (entry) parts.push(`{${entry.partId}}`);
    }

    ["Element 1", "Element 2"].forEach((key) => {
      const sel = partSelections[key];
      const pid = partIdFromLabel(sel ?? "");
      if (pid) parts.push(`{1:${pid}}`);
    });

    const specialKeys = new Set(["Rarity", "Legendary Type", "Element 1", "Element 2"]);
    Object.entries(partSelections).forEach(([key, label]) => {
      const base = key.split("_")[0];
      if (specialKeys.has(base) || specialKeys.has(key)) return;
      const pid = partIdFromLabel(label);
      if (pid) parts.push(`{${pid}}`);
    });

    let decoded = `${header} ${parts.join(" ")} |`;
    if (skinToken) {
      const safe = (skinToken || "").replace(/"/g, '\\"');
      decoded = decoded.replace(/\|\s*$/, ` "c", "${safe}" |`);
    }
    return decoded;
  }, [mfgWtId, level, seed, partSelections, skinToken, data]);

  const encodeAndSet = useCallback(
    async (decoded: string) => {
      if (!decoded.trim()) return;
      setLoading("encode");
      setMessage(null);
      try {
        const res = await fetchApi("save/encode-serial", {
          method: "POST",
          body: JSON.stringify({ decoded_string: decoded }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(
            isLikelyUnavailable(res)
              ? getApiUnavailableError()
              : (d?.error ?? "Encode failed")
          );
          return;
        }
        if (d?.success && typeof d?.serial === "string") {
          setDecodedDisplay(decoded);
          setEncodedSerial(d.serial);
        } else setMessage(d?.error ?? "Encode failed");
      } catch {
        setMessage(getApiUnavailableError());
      } finally {
        setLoading(null);
      }
    },
    []
  );

  useEffect(() => {
    const decoded = buildDecoded();
    if (!decoded || decoded === `${mfgWtId}, 0, 1, 50| 2, ${seed}|| |`) {
      setDecodedDisplay("");
      setEncodedSerial("");
      return;
    }
    const t = setTimeout(() => encodeAndSet(decoded), 400);
    return () => clearTimeout(t);
  }, [buildDecoded, mfgWtId, seed]);

  const handleAddToBackpack = useCallback(async () => {
    const serial = encodedSerial.trim();
    if (!serial.startsWith("@U")) {
      setMessage("Generate a weapon first (select manufacturer and parts).");
      return;
    }
    if (!saveData) {
      setMessage("Load a save first (Character → Select Save).");
      return;
    }
    const yamlContent = getYamlText();
    if (!yamlContent?.trim()) {
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
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(
          isLikelyUnavailable(res)
            ? getApiUnavailableError()
            : (d?.error ?? "Add failed")
        );
        return;
      }
      if (d?.success && typeof d?.yaml_content === "string") {
        updateSaveData(yamlParse(d.yaml_content) as Record<string, unknown>);
        setMessage("Weapon added to backpack. Use Download .sav on Select Save to export.");
      } else setMessage(d?.error ?? "Add failed");
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [encodedSerial, saveData, flagValue, getYamlText, updateSaveData]);

  const applySkin = useCallback(() => {
    const token = skinComboValue || null;
    setSkinToken(token);
    const decoded = buildDecoded();
    if (decoded) encodeAndSet(decoded);
  }, [skinComboValue, buildDecoded, encodeAndSet]);

  const openGodRoller = useCallback(() => {
    if (data?.godrolls?.length) {
      setGodRollSelectedIndex(0);
      setGodRollModalOpen(true);
    } else {
      setMessage("No God Rolls loaded. Add godrolls.json to the project.");
    }
  }, [data?.godrolls]);

  const godRollAddToBackpack = useCallback(async () => {
    const list = data?.godrolls ?? [];
    const preset = list[godRollSelectedIndex];
    if (!preset?.decoded) return;
    if (!saveData) {
      setMessage("Load a save first (Character → Select Save).");
      return;
    }
    const decoded = preset.decoded.trim();
    setLoading("add");
    setMessage(null);
    try {
      const encRes = await fetchApi("save/encode-serial", {
        method: "POST",
        body: JSON.stringify({ decoded_string: decoded }),
      });
      const encData = await encRes.json().catch(() => ({}));
      if (!encRes.ok || !encData?.success || typeof encData?.serial !== "string") {
        setMessage(encData?.error ?? "Encode failed");
        setLoading(null);
        return;
      }
      setDecodedDisplay(decoded);
      setEncodedSerial(encData.serial);
      const yamlContent = getYamlText();
      if (!yamlContent?.trim()) {
        setMessage("No save YAML loaded.");
        setLoading(null);
        return;
      }
      const addRes = await fetchApi("save/add-item", {
        method: "POST",
        body: JSON.stringify({
          yaml_content: yamlContent,
          serial: encData.serial,
          flag: String(flagValue),
        }),
      });
      const addData = await addRes.json().catch(() => ({}));
      if (!addRes.ok) {
        setMessage(isLikelyUnavailable(addRes) ? getApiUnavailableError() : (addData?.error ?? "Add failed"));
        setLoading(null);
        return;
      }
      if (addData?.success && typeof addData?.yaml_content === "string") {
        updateSaveData(yamlParse(addData.yaml_content) as Record<string, unknown>);
        setMessage("God Roll added to backpack.");
        setGodRollModalOpen(false);
      } else setMessage(addData?.error ?? "Add failed");
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [data?.godrolls, godRollSelectedIndex, saveData, flagValue, getYamlText, updateSaveData]);

  const godRollCustomize = useCallback(() => {
    const list = data?.godrolls ?? [];
    const preset = list[godRollSelectedIndex];
    if (preset?.decoded) {
      setDecodedDisplay(preset.decoded);
      setGodRollModalOpen(false);
      navigate("/weapon-toolbox/weapon-edit", {
        state: { pasteDecoded: preset.decoded },
      });
    }
  }, [data?.godrolls, godRollSelectedIndex, navigate]);

  const setPart = useCallback((key: string, value: string) => {
    setPartSelections((prev) => ({ ...prev, [key]: value }));
  }, []);

  if (loadError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-accent)]">{loadError}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        Loading weapon data…
      </p>
    );
  }

  const rarityStats = mfgWtId && data.rarityByMfgTypeId[mfgWtId]
    ? [...new Set(data.rarityByMfgTypeId[mfgWtId].map((r) => r.stat).filter(Boolean))].sort()
    : [];
  const rarityOptions = mfgWtId
    ? [NONE, ...rarityStats.filter((s) => s !== "Legendary"), "Legendary"]
    : [NONE];
  const legendaryOptions = mfgWtId
    ? [
        NONE,
        ...(data.legendaryByMfgTypeId[mfgWtId]?.map(
          (r) => `${r.partId} - ${r.description}`
        ) ?? []),
      ]
    : [NONE];
  const raritySel = partSelections["Rarity"] ?? NONE;
  const showLegendaryType = raritySel === "Legendary";

  const inputClass =
    "w-full min-w-0 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] min-h-[44px]";
  const labelClass = "text-sm font-medium text-[var(--color-accent)]";
  const blockClass =
    "border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]";

  return (
    <div className="space-y-4">
      {/* Output read-only */}
      <div className={`${blockClass} grid gap-4 md:grid-cols-2`}>
        <div>
          <h3 className={labelClass}>Deserialized</h3>
          <textarea
            readOnly
            value={decodedDisplay}
            rows={4}
            className={`${inputClass} font-mono text-xs resize-y`}
          />
        </div>
        <div>
          <h3 className={labelClass}>Base85</h3>
          <textarea
            readOnly
            value={encodedSerial}
            rows={4}
            className={`${inputClass} font-mono text-xs resize-y`}
          />
        </div>
      </div>

      {/* Manufacturer, Type, Level, Seed */}
      <div className={`${blockClass} flex flex-wrap items-center gap-3 gap-y-2`}>
        <label className={labelClass}>Manufacturer</label>
        <select
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
          className={inputClass}
          style={{ maxWidth: "12rem" }}
        >
          {data.manufacturers.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <label className={labelClass}>Weapon Type</label>
        <select
          value={weaponType}
          onChange={(e) => setWeaponType(e.target.value)}
          className={inputClass}
          style={{ maxWidth: "12rem" }}
        >
          {data.weaponTypes.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
        <label className={labelClass}>Level</label>
        <input
          type="text"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className={inputClass}
          style={{ width: "4rem" }}
        />
        <label className={labelClass}>Seed</label>
        <input
          type="text"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          className={inputClass}
          style={{ width: "5rem" }}
        />
        <button
          type="button"
          onClick={() =>
            setSeed(String(Math.floor(100 + Math.random() * 9900)))
          }
          className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] min-h-[44px]"
          title="Random seed"
        >
          🎲
        </button>
      </div>

      {/* Part pickers: scrollable two-column grid, desktop order */}
      {mfgWtId && (
        <div className={blockClass}>
          <h3 className={`${labelClass} mb-3`}>Weapon parts</h3>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 max-h-[60vh] overflow-y-auto pr-2"
            style={{ scrollbarGutter: "stable" }}
          >
            {/* Fixed order matching desktop: left col then right col */}
            {[
              { key: "Rarity", slots: 1 },
              { key: "Legendary Type", slots: 1, show: showLegendaryType },
              { key: "Element 1", slots: 1 },
              { key: "Element 2", slots: 1 },
              { key: "Body", slots: 1 },
              { key: "Body Accessory", slots: MULTI_SLOTS["Body Accessory"] ?? 1 },
              { key: "Barrel", slots: 1 },
              { key: "Barrel Accessory", slots: MULTI_SLOTS["Barrel Accessory"] ?? 1 },
              { key: "Magazine", slots: 1 },
              { key: "Stat Modifier", slots: 1 },
              { key: "Grip", slots: 1 },
              { key: "Foregrip", slots: 1 },
              { key: "Manufacturer Part", slots: MULTI_SLOTS["Manufacturer Part"] ?? 1 },
              { key: "Scope", slots: 1 },
              { key: "Scope Accessory", slots: MULTI_SLOTS["Scope Accessory"] ?? 1 },
              { key: "Underbarrel", slots: 1 },
              { key: "Underbarrel Accessory", slots: MULTI_SLOTS["Underbarrel Accessory"] ?? 1 },
            ].map(({ key: partType, slots, show }) => {
              if (show === false && partType === "Legendary Type") return null;
              const opts = partType === "Rarity"
                ? rarityOptions.map((o) => ({ partId: o, label: o }))
                : partType === "Legendary Type"
                  ? legendaryOptions.map((o) => ({ partId: o, label: o }))
                  : partType === "Element 1" || partType === "Element 2"
                    ? data.elemental.map((e) => ({
                        partId: `${e.partId} - ${e.stat}`,
                        label: `${e.partId} - ${e.stat}`,
                      }))
                    : (data.partsByMfgTypeId[mfgWtId]?.[partType] ?? []);
              return (
                <div key={partType} className="space-y-1.5">
                  <label className={`${labelClass} block`}>{partType}</label>
                  {Array.from({ length: slots }, (_, i) => {
                    const key = slots > 1 ? `${partType}_${i}` : partType;
                    return (
                      <select
                        key={key}
                        value={partSelections[key] ?? NONE}
                        onChange={(e) => setPart(key, e.target.value)}
                        className={inputClass}
                      >
                        <option value={NONE}>{NONE}</option>
                        {opts.map((o, idx) => (
                          <option key={idx} value={o.label}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Skin: "Add to Gun" appends skin code to current weapon and updates Deserialized + Base85 above */}
      <div className={blockClass}>
        <label className={labelClass}>Skin</label>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <select
            value={skinComboValue}
            onChange={(e) => {
              const v = e.target.value;
              setSkinComboValue(v);
            }}
            className={inputClass}
            style={{ maxWidth: "20rem" }}
          >
            <option value="">{NONE}</option>
            {data.skins.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={applySkin}
            className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] min-h-[44px]"
          >
            Add to Gun
          </button>
        </div>
      </div>

      {/* Actions: Flag, God Roller, Add to Backpack */}
      <div className={`${blockClass} flex flex-wrap items-center gap-3`}>
        <label className={labelClass}>Select Flag</label>
        <select
          value={flagValue}
          onChange={(e) => setFlagValue(Number(e.target.value))}
          className={inputClass}
          style={{ width: "10rem" }}
        >
          {FLAG_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={openGodRoller}
          className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] min-h-[44px]"
        >
          God Roller
        </button>
        <button
          type="button"
          onClick={handleAddToBackpack}
          disabled={loading !== null || !saveData}
          className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium hover:opacity-90 disabled:opacity-50 min-h-[44px]"
        >
          {loading === "add" ? "Adding…" : "Add to Backpack"}
        </button>
        {!saveData && (
          <Link
            to="/character/select-save"
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            Load a save first
          </Link>
        )}
      </div>

      {message && (
        <p className="text-sm text-[var(--color-accent)]">{message}</p>
      )}

      {/* God Roll modal */}
      {godRollModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg-overlay)]"
          onClick={() => setGodRollModalOpen(false)}
        >
          <div
            className={`${blockClass} max-w-md w-full mx-4 shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`${labelClass} mb-2`}>Choose God Roll</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              Choose God Roll
            </p>
            <select
              value={godRollSelectedIndex}
              onChange={(e) => setGodRollSelectedIndex(Number(e.target.value))}
              className={inputClass}
            >
              {data.godrolls.map((g, i) => (
                <option key={i} value={i}>
                  {g.name}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                type="button"
                onClick={() => setGodRollModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={godRollAddToBackpack}
                disabled={loading !== null}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium"
              >
                Add to Backpack
              </button>
              <button
                type="button"
                onClick={godRollCustomize}
                className="px-4 py-2 rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)]"
              >
                Customize God Roll
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
