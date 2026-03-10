import { useState, useCallback, useEffect, useRef, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { parse as yamlParse } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import {
  fetchApi,
  getApiUnavailableError,
  isLikelyUnavailable,
} from "@/lib/apiClient";
import SkinPreview from "@/components/weapon-toolbox/SkinPreview";

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

const ADD_OTHER_OPTION = "__ADD_OTHER_PARTS__";

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
  pearlByMfgTypeId: Record<
    string,
    { partId: string; description: string }[]
  >;
  elemental: { partId: string; stat: string }[];
  godrolls: { name: string; decoded: string }[];
  skins: { label: string; value: string }[];
}

interface SuperExtraPartSelection {
  code: string;
  label: string;
  /** Effect/stat text (e.g. "+Damage") so search finds "+damage" and similar. */
  effect?: string;
  itemType?: string;
  manufacturer?: string;
  partType?: string;
  rarity?: string;
  checked: boolean;
  qty: string;
}

interface WeaponGenViewProps {
  suppressCodecPanels?: boolean;
  onCodecChange?: (payload: { base85: string; decoded: string }) => void;
  externalSuperPartInsert?: { id: number; code: string } | null;
}

interface ThemedSelectOption {
  value: string;
  label: string;
}

function ThemedSelect(props: {
  value: string;
  onChange: (value: string) => void;
  options: ThemedSelectOption[];
  className: string;
  style?: CSSProperties;
  title?: string;
}) {
  const { value, onChange, options, className, style, title } = props;
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!wrapperRef.current || !target) return;
      if (!wrapperRef.current.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("touchstart", onDocPointerDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("touchstart", onDocPointerDown);
    };
  }, []);

  const selected = options.find((o) => o.value === value) ?? options[0] ?? { value: "", label: "" };

  return (
    <div ref={wrapperRef} className="relative" style={style}>
      <button
        type="button"
        className={`${className} text-left pr-8`}
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="block truncate">{selected.label}</span>
      </button>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">▾</span>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl">
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={`${opt.value}-${opt.label}`}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`block w-full text-left px-3 py-2 text-sm min-h-[38px] ${
                  active
                    ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                    : "text-[var(--color-text)] hover:bg-[var(--color-accent)]/10 hover:text-[var(--color-accent)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function partIdFromLabel(label: string): string | null {
  if (!label || label === NONE) return null;
  const first = label.split(" - ")[0]?.trim();
  if (first && /^\d+$/.test(first)) return first;
  return null;
}

/** Normalize rarity for Add Other Parts filter: Pearl/Pearlescent → Pearl. */
function normalizeSuperRarity(r: string | undefined): string {
  if (!r) return "";
  const lower = r.trim().toLowerCase();
  if (lower === "pearl" || lower === "pearlescent") return "Pearl";
  return r.trim();
}

/** True if part's rarity matches the filter value (filter "" = any). */
function superPartMatchesRarity(partRarity: string | undefined, filterValue: string): boolean {
  if (!filterValue) return true;
  return normalizeSuperRarity(partRarity) === filterValue;
}

/** Build decoded string from explicit selections (for Auto Fill → add + open in editor). */
function buildDecodedFromSelections(
  data: WeaponGenData | null,
  mfgWtId: string,
  level: string,
  seed: string,
  selections: Record<string, string>,
  skinValue: string
): string {
  if (!mfgWtId) return "";
  const lvl = /^\d+$/.test(level) ? level : "50";
  const sd = /^\d+$/.test(seed) ? seed : String(Math.floor(100 + Math.random() * 9900));
  const header = `${mfgWtId}, 0, 1, ${lvl}| 2, ${sd}||`;
  const parts: string[] = [];

  const raritySel = selections["Rarity"];
  const isLegendary = raritySel === "Legendary";
  const isPearl = raritySel === "Pearl";
  if (isLegendary) {
    const legSel = selections["Legendary Type"];
    const pid = partIdFromLabel(legSel ?? "");
    if (pid) parts.push(`{${pid}}`);
  } else if (isPearl) {
    const pearlSel = selections["Pearl Type"];
    const pid = partIdFromLabel(pearlSel ?? "");
    if (pid) parts.push(`{${pid}}`);
  } else if (raritySel && raritySel !== NONE) {
    const entry = data?.rarityByMfgTypeId[mfgWtId]?.find((r) => r.stat === raritySel);
    if (entry) parts.push(`{${entry.partId}}`);
  }

  ["Element 1", "Element 2"].forEach((key) => {
    const sel = selections[key];
    const pid = partIdFromLabel(sel ?? "");
    if (pid) parts.push(`{1:${pid}}`);
  });

  const specialKeys = new Set(["Rarity", "Legendary Type", "Pearl Type", "Element 1", "Element 2"]);
  Object.entries(selections).forEach(([key, label]) => {
    const base = key.split("_")[0];
    if (specialKeys.has(base) || specialKeys.has(key)) return;
    const pid = partIdFromLabel(label);
    if (pid) parts.push(`{${pid}}`);
  });

  let decoded = `${header} ${parts.join(" ")} |`;
  if (skinValue) {
    const safe = skinValue.replace(/"/g, '\\"');
    decoded = decoded.replace(/\|\s*"c",\s*"(?:[^"\\]|\\.)*"\s*\|?\s*$/i, " |");
    const normalized = decoded.trim().endsWith("|") ? decoded.trim() : `${decoded.trim()} |`;
    decoded = normalized.replace(/\|\s*$/, `| "c", "${safe}" |`);
  }
  return decoded;
}

export default function WeaponGenView({
  suppressCodecPanels = false,
  onCodecChange,
  externalSuperPartInsert = null,
}: WeaponGenViewProps = {}) {
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
  const [partQuantities, setPartQuantities] = useState<Record<string, string>>({});
  const [skinToken, setSkinToken] = useState<string | null>(null);
  const [skinComboValue, setSkinComboValue] = useState("");
  const [flagValue, setFlagValue] = useState(3);

  const [decodedDisplay, setDecodedDisplay] = useState("");
  const [encodedSerial, setEncodedSerial] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<"encode" | "add" | null>(null);
  const [godRollModalOpen, setGodRollModalOpen] = useState(false);
  const [godRollSelectedIndex, setGodRollSelectedIndex] = useState(0);
  const [autoFillWarning, setAutoFillWarning] = useState<string | null>(null);
  const [superParts, setSuperParts] = useState<SuperExtraPartSelection[]>([]);
  const [superSearch, setSuperSearch] = useState("");
  const [superManufacturerFilter, setSuperManufacturerFilter] = useState("");
  const [superRarityFilter, setSuperRarityFilter] = useState("");
  const [showSuperAddParts, setShowSuperAddParts] = useState(false);
  const [pendingQtyPart, setPendingQtyPart] = useState<{ key: string; value: string; label: string; previousValue: string } | null>(null);
  const [pendingQtyInput, setPendingQtyInput] = useState("1");

  const mfgWtId =
    data?.mfgWtIdList.find(
      (e) => e.manufacturer === manufacturer && e.weaponType === weaponType
    )?.mfgWtId ?? null;

  useEffect(() => {
    const list = data?.mfgWtIdList ?? [];
    if (!list.length) return;

    // Initial load.
    if (!manufacturer || !weaponType) {
      setManufacturer(list[0].manufacturer);
      setWeaponType(list[0].weaponType);
      return;
    }

    // Keep user selection stable by auto-fixing only the incompatible side.
    const exact = list.some((e) => e.manufacturer === manufacturer && e.weaponType === weaponType);
    if (exact) return;

    const sameManufacturer = list.find((e) => e.manufacturer === manufacturer);
    if (sameManufacturer) {
      setWeaponType(sameManufacturer.weaponType);
      return;
    }

    const sameWeaponType = list.find((e) => e.weaponType === weaponType);
    if (sameWeaponType) {
      setManufacturer(sameWeaponType.manufacturer);
      return;
    }

    setManufacturer(list[0].manufacturer);
    setWeaponType(list[0].weaponType);
  }, [data?.mfgWtIdList, manufacturer, weaponType]);

  useEffect(() => {
    setPartSelections({});
    setPartQuantities({});
  }, [mfgWtId]);

  // Load universal part metadata for Super Weapon Gen extra parts picker.
  useEffect(() => {
    let cancelled = false;
    fetchApi("parts/data")
      .then((r) => r.json())
      .then((d: { items?: unknown[] }) => {
        if (cancelled) return;
        const items = Array.isArray(d?.items) ? d.items : [];
        const next: SuperExtraPartSelection[] = [];
        for (const it of items) {
          if (!it || typeof it !== "object") continue;
          const raw = it as Record<string, unknown>;
          const code = String(raw.code ?? raw.Code ?? "").trim();
          if (!code) continue;
          const label =
            String(raw.partName ?? raw.name ?? raw.String ?? raw["Canonical Name"] ?? "").trim() ||
            code;
          const effect = [
            raw.effect,
            raw.Effect,
            raw["Stats (Level 50, Common)"],
            raw.Stats,
            raw["Search Text"],
            raw.Description,
          ]
            .map((v) => String(v ?? "").trim())
            .filter(Boolean)
            .join(" ") || undefined;
          next.push({
            code,
            label,
            effect,
            itemType: String(raw.itemType ?? raw["Item Type"] ?? "").trim() || undefined,
            manufacturer: String(raw.manufacturer ?? raw.Manufacturer ?? "").trim() || undefined,
            partType: String(raw.partType ?? raw["Part Type"] ?? "").trim() || undefined,
            rarity: String(raw.rarity ?? raw.Rarity ?? "").trim() || undefined,
            checked: false,
            qty: "1",
          });
        }
        setSuperParts(next);
      })
      .catch(() => {
        if (!cancelled) setSuperParts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Allow parent surfaces (Gear Forge mini search) to inject a code directly into Super Weapon Gen.
  useEffect(() => {
    const code = externalSuperPartInsert?.code?.trim();
    if (!code) return;
    setSuperParts((prev) => [
      {
        code,
        label: `Manual insert ${code}`,
        checked: true,
        qty: "1",
      },
      ...prev,
    ]);
    setShowSuperAddParts(true);
  }, [externalSuperPartInsert]);

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

    const qtyFor = (key: string): number => {
      const raw = partQuantities[key]?.trim() ?? "1";
      if (!raw || !/^\d+$/.test(raw)) return 1;
      return Math.max(1, Math.min(99, Number(raw)));
    };

    const raritySel = partSelections["Rarity"];
    const isLegendary = raritySel === "Legendary";
    const isPearl = raritySel === "Pearl";
    if (isLegendary) {
      const legSel = partSelections["Legendary Type"];
      const pid = partIdFromLabel(legSel ?? "");
      if (pid) {
        const qty = qtyFor("Legendary Type");
        if (qty <= 1) parts.push(`{${pid}}`);
        else parts.push(`{${mfgWtId}:[${Array(qty).fill(pid).join(" ")}]}`);
      }
    } else if (isPearl) {
      const pearlSel = partSelections["Pearl Type"];
      const pid = partIdFromLabel(pearlSel ?? "");
      if (pid) {
        const qty = qtyFor("Pearl Type");
        if (qty <= 1) parts.push(`{${pid}}`);
        else parts.push(`{${mfgWtId}:[${Array(qty).fill(pid).join(" ")}]}`);
      }
    } else if (raritySel && raritySel !== NONE) {
      const entry = data?.rarityByMfgTypeId[mfgWtId]?.find((r) => r.stat === raritySel);
      if (entry) {
        const qty = qtyFor("Rarity");
        if (qty <= 1) parts.push(`{${entry.partId}}`);
        else parts.push(`{${mfgWtId}:[${Array(qty).fill(entry.partId).join(" ")}]}`);
      }
    }

    ["Element 1", "Element 2"].forEach((key) => {
      const sel = partSelections[key];
      const pid = partIdFromLabel(sel ?? "");
      if (!pid) return;
      const qty = qtyFor(key);
      if (qty <= 1) parts.push(`{1:${pid}}`);
      else parts.push(`{1:[${Array(qty).fill(pid).join(" ")}]}`);
    });

    const specialKeys = new Set(["Rarity", "Legendary Type", "Pearl Type", "Element 1", "Element 2"]);
    Object.entries(partSelections).forEach(([key, label]) => {
      const base = key.split("_")[0];
      if (specialKeys.has(base) || specialKeys.has(key)) return;
      const pid = partIdFromLabel(label);
      if (!pid) return;
      const qty = qtyFor(key);
      if (qty <= 1) parts.push(`{${pid}}`);
      else parts.push(`{${mfgWtId}:[${Array(qty).fill(pid).join(" ")}]}`);
    });

    // Append extra parts from Super Weapon Gen picker in grouped format {xx:[yy yy yy]}.
    for (const p of superParts) {
      if (!p.checked) continue;
      const rawQty = p.qty.trim();
      const qty =
        rawQty && /^\d+$/.test(rawQty) ? Math.max(1, Math.min(99, Number(rawQty))) : 1;
      const code = p.code.trim();
      const codeMatch = code.match(/^\{\s*(\d+)\s*(?:\:\s*(\d+)\s*)?\}$/);
      if (!codeMatch) {
        for (let i = 0; i < qty; i += 1) parts.push(code);
        continue;
      }
      const typeId = Number(codeMatch[1]);
      const partId = codeMatch[2] != null ? Number(codeMatch[2]) : typeId;
      if (qty === 1) {
        parts.push(partId === typeId && codeMatch[2] == null ? `{${partId}}` : `{${typeId}:${partId}}`);
      } else {
        parts.push(`{${typeId}:[${Array(qty).fill(partId).join(" ")}]}`);
      }
    }

    let decoded = `${header} ${parts.join(" ")} |`;
    if (skinToken) {
      const safe = (skinToken || "").replace(/"/g, '\\"');
      decoded = decoded.replace(/\|\s*"c",\s*"(?:[^"\\]|\\.)*"\s*\|?\s*$/i, " |");
      const normalized = decoded.trim().endsWith("|") ? decoded.trim() : `${decoded.trim()} |`;
      decoded = normalized.replace(/\|\s*$/, `| "c", "${safe}" |`);
    }
    return decoded;
  }, [mfgWtId, level, seed, partSelections, partQuantities, skinToken, data, superParts]);

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

  useEffect(() => {
    onCodecChange?.({ base85: encodedSerial, decoded: decodedDisplay });
  }, [encodedSerial, decodedDisplay, onCodecChange]);

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
      navigate("/gear-forge", {
        state: { tab: "editor", editorKind: "editor", pasteDecoded: preset.decoded },
      });
    }
  }, [data?.godrolls, godRollSelectedIndex, navigate]);

  const setPart = useCallback((key: string, value: string) => {
    setPartSelections((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setPartQuantity = useCallback((key: string, value: string) => {
    setPartQuantities((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSurpriseMe = useCallback(() => {
    if (!data?.mfgWtIdList?.length) return;
    const list = data.mfgWtIdList;
    const mfgWtEntry = list[Math.floor(Math.random() * list.length)];
    const mfgWtId = mfgWtEntry.mfgWtId;
    setManufacturer(mfgWtEntry.manufacturer);
    setWeaponType(mfgWtEntry.weaponType);
    setLevel(String(Math.floor(1 + Math.random() * 50)));
    setSeed(String(Math.floor(100 + Math.random() * 9900)));

    const rarityStats = data.rarityByMfgTypeId[mfgWtId]
      ? [...new Set(data.rarityByMfgTypeId[mfgWtId].map((r) => r.stat).filter(Boolean))].sort()
      : [];
    const nonSpecialRarity = rarityStats.filter((s) => s !== "Legendary" && s !== "Pearl" && s !== "Pearlescent");
    const rarityChoices = [...nonSpecialRarity];
    if ((data.pearlByMfgTypeId[mfgWtId]?.length ?? 0) > 0) rarityChoices.push("Pearl");
    rarityChoices.push("Legendary");
    const legendaryLabels = (data.legendaryByMfgTypeId[mfgWtId]?.map((r) => `${r.partId} - ${r.description}`) ?? []);
    const pearlLabels = (data.pearlByMfgTypeId[mfgWtId]?.map((r) => `${r.partId} - ${r.description}`) ?? []);
    const elementalOptions = data.elemental.map((e) => `${e.partId} - ${e.stat}`);

    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const selections: Record<string, string> = {};

    if (rarityChoices.length) selections["Rarity"] = pick(rarityChoices);
    if (selections["Rarity"] === "Legendary" && legendaryLabels.length) {
      selections["Legendary Type"] = pick(legendaryLabels);
    } else if (selections["Rarity"] === "Pearl" && pearlLabels.length) {
      selections["Pearl Type"] = pick(pearlLabels);
    }
    if (elementalOptions.length) {
      selections["Element 1"] = pick(elementalOptions);
      selections["Element 2"] = pick(elementalOptions);
    }

    const partOrder = [
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
    ];
    for (const { key: partType, slots } of partOrder) {
      const opts = data.partsByMfgTypeId[mfgWtId]?.[partType] ?? [];
      const choices = opts.length > 0 ? opts.map((o) => o.label) : [NONE];
      for (let i = 0; i < slots; i++) {
        const key = slots > 1 ? `${partType}_${i}` : partType;
        selections[key] = pick(choices);
      }
    }
    // When this weapon type has Underbarrel Accessory options (some underbarrels unlock that tab), ensure we fill all slots
    const underbarrelAccOpts = data.partsByMfgTypeId[mfgWtId]?.["Underbarrel Accessory"] ?? [];
    const underbarrelAccSlots = MULTI_SLOTS["Underbarrel Accessory"] ?? 1;
    if (underbarrelAccOpts.length > 0) {
      const underbarrelAccChoices = underbarrelAccOpts.map((o) => o.label);
      for (let i = 0; i < underbarrelAccSlots; i++) {
        selections[`Underbarrel Accessory_${i}`] = pick(underbarrelAccChoices);
      }
    }

    // Defer so this runs after the effect that clears partSelections when mfgWtId changes
    setTimeout(() => setPartSelections(selections), 0);

    if (data.skins.length > 0) {
      const skinPick = pick(data.skins);
      setSkinComboValue(skinPick.value);
      setSkinToken(skinPick.value);
    } else {
      setSkinComboValue("");
      setSkinToken(null);
    }
  }, [data]);

  const handleAutoFill = useCallback(async () => {
    if (!data || !mfgWtId) {
      setAutoFillWarning("Please choose manufacturer, level, weapon type, and rarity first.");
      return;
    }
    const hasManufacturer = manufacturer.trim().length > 0;
    const hasWeaponType = weaponType.trim().length > 0;
    const hasValidLevel = /^\d+$/.test(level) && Number(level) > 0;
    const raritySel = partSelections["Rarity"] ?? NONE;
    if (!hasManufacturer || !hasWeaponType || !hasValidLevel || raritySel === NONE) {
      setAutoFillWarning("Please choose manufacturer, level, weapon type, and rarity first.");
      return;
    }
    setAutoFillWarning(null);

    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const selections: Record<string, string> = { ...partSelections };
    const legendaryLabels = data.legendaryByMfgTypeId[mfgWtId]?.map((r) => `${r.partId} - ${r.description}`) ?? [];
    const pearlLabels = data.pearlByMfgTypeId[mfgWtId]?.map((r) => `${r.partId} - ${r.description}`) ?? [];
    const existingLegendary = partSelections["Legendary Type"];
    const existingPearl = partSelections["Pearl Type"];
    if (raritySel === "Legendary") {
      selections["Legendary Type"] =
        existingLegendary && existingLegendary !== NONE && legendaryLabels.includes(existingLegendary)
          ? existingLegendary
          : legendaryLabels.length
            ? pick(legendaryLabels)
            : NONE;
      selections["Pearl Type"] = NONE;
    } else if (raritySel === "Pearl") {
      selections["Pearl Type"] =
        existingPearl && existingPearl !== NONE && pearlLabels.includes(existingPearl)
          ? existingPearl
          : pearlLabels.length
            ? pick(pearlLabels)
            : NONE;
      selections["Legendary Type"] = NONE;
    } else {
      selections["Legendary Type"] = NONE;
      selections["Pearl Type"] = NONE;
    }

    const elementalOptions = data.elemental.map((e) => `${e.partId} - ${e.stat}`);
    if (elementalOptions.length) {
      selections["Element 1"] = pick(elementalOptions);
      selections["Element 2"] = pick(elementalOptions);
    }

    const partOrder = [
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
    ];
    for (const { key: partType, slots } of partOrder) {
      const opts = data.partsByMfgTypeId[mfgWtId]?.[partType] ?? [];
      const choices = opts.length > 0 ? opts.map((o) => o.label) : [NONE];
      for (let i = 0; i < slots; i++) {
        const key = slots > 1 ? `${partType}_${i}` : partType;
        selections[key] = pick(choices);
      }
    }
    setPartSelections(selections);

    let skinValue = "";
    if (data.skins.length > 0) {
      const skinPick = pick(data.skins);
      skinValue = skinPick.value;
      setSkinComboValue(skinPick.value);
      setSkinToken(skinPick.value);
    }

    const decoded = buildDecodedFromSelections(data, mfgWtId, level, seed, selections, skinValue);
    if (!decoded.trim()) {
      setMessage("Auto-filled parts for selected manufacturer, weapon type, level, and rarity.");
      return;
    }

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
      const serial = encData.serial;
      setDecodedDisplay(decoded);
      setEncodedSerial(serial);

      if (saveData) {
        const yamlContent = getYamlText();
        if (yamlContent?.trim()) {
          const addRes = await fetchApi("save/add-item", {
            method: "POST",
            body: JSON.stringify({
              yaml_content: yamlContent,
              serial,
              flag: String(flagValue),
            }),
          });
          const addData = await addRes.json().catch(() => ({}));
          if (addRes.ok && addData?.success && typeof addData?.yaml_content === "string") {
            updateSaveData(yamlParse(addData.yaml_content) as Record<string, unknown>);
          }
        }
      }

      navigate("/gear-forge", {
        state: {
          tab: "editor",
          editorKind: "editor",
          loadItem: { serial, decodedFull: decoded },
        },
      });
      setMessage(
        saveData
          ? "Auto-filled, added to backpack, and opened in Serial Editor."
          : "Auto-filled and opened in Serial Editor. Load a save to add to backpack next time.",
      );
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [data, mfgWtId, manufacturer, weaponType, level, partSelections, seed, saveData, flagValue, getYamlText, updateSaveData, navigate]);

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
    ? [NONE, ...rarityStats.filter((s) => s !== "Legendary" && s !== "Pearl" && s !== "Pearlescent"), "Pearl", "Legendary"]
    : [NONE];
  const legendaryOptions = mfgWtId
    ? [
        NONE,
        ...(data.legendaryByMfgTypeId[mfgWtId]?.map(
          (r) => `${r.partId} - ${r.description}`
        ) ?? []),
      ]
    : [NONE];
  const pearlOptions = mfgWtId
    ? [
        NONE,
        ...(data.pearlByMfgTypeId[mfgWtId]?.map(
          (r) => `${r.partId} - ${r.description}`
        ) ?? []),
      ]
    : [NONE];
  const raritySel = partSelections["Rarity"] ?? NONE;
  const showLegendaryType = raritySel === "Legendary";
  const showPearlType = raritySel === "Pearl";

  const inputClass =
    "w-full min-w-0 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] min-h-[44px]";
  const labelClass = "text-sm font-medium text-[var(--color-accent)]";
  const blockClass =
    "border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]";

  return (
    <div className="space-y-4">
      {!suppressCodecPanels && (
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
      )}

      {/* Manufacturer, Type, Level, Seed */}
      <div className={`${blockClass} flex flex-wrap items-center gap-3 gap-y-2`}>
        <label className={labelClass}>Manufacturer</label>
        <ThemedSelect
          value={manufacturer}
          onChange={(nextManufacturer) => {
            setManufacturer(nextManufacturer);
            const list = data?.mfgWtIdList ?? [];
            const stillValid = list.some(
              (entry) => entry.manufacturer === nextManufacturer && entry.weaponType === weaponType,
            );
            if (!stillValid) {
              const fallback = list.find((entry) => entry.manufacturer === nextManufacturer);
              if (fallback) setWeaponType(fallback.weaponType);
            }
          }}
          options={data.manufacturers.map((m) => ({ value: m, label: m }))}
          className={inputClass}
          style={{ maxWidth: "12rem" }}
        />
        <label className={labelClass}>Weapon Type</label>
        <ThemedSelect
          value={weaponType}
          onChange={(nextWeaponType) => {
            setWeaponType(nextWeaponType);
            const list = data?.mfgWtIdList ?? [];
            const stillValid = list.some(
              (entry) => entry.manufacturer === manufacturer && entry.weaponType === nextWeaponType,
            );
            if (!stillValid) {
              const fallback = list.find((entry) => entry.weaponType === nextWeaponType);
              if (fallback) setManufacturer(fallback.manufacturer);
            }
          }}
          options={data.weaponTypes.map((w) => ({ value: w, label: w }))}
          className={inputClass}
          style={{ maxWidth: "12rem" }}
        />
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
          className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] hover:border-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)] min-h-[44px]"
          title="Random seed"
        >
          🎲
        </button>
        <button
          type="button"
          onClick={handleSurpriseMe}
          className="px-4 py-2 rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-black min-h-[44px] font-medium"
          title="Randomize manufacturer, type, level, seed, all parts, and skin"
        >
          Surprise Me
        </button>
        <button
          type="button"
          onClick={() => void handleAutoFill()}
          disabled={loading !== null}
          className="px-4 py-2 rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-black min-h-[44px] font-medium disabled:opacity-50"
          title="Auto-fill parts, add to backpack (if save loaded), and open in Serial Editor"
        >
          {loading === "add" ? "Adding…" : "Auto Fill"}
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
              { key: "Pearl Type", slots: 1, show: showPearlType },
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
              if (show === false && (partType === "Legendary Type" || partType === "Pearl Type")) return null;
              const opts = partType === "Rarity"
                ? rarityOptions.map((o) => ({ partId: o, label: o }))
                : partType === "Legendary Type"
                  ? legendaryOptions.map((o) => ({ partId: o, label: o }))
                  : partType === "Pearl Type"
                    ? pearlOptions.map((o) => ({ partId: o, label: o }))
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
                      <div key={key} className="flex items-center gap-2 flex-wrap">
                        <ThemedSelect
                          value={partSelections[key] ?? NONE}
                          onChange={(value) => {
                            if (value === ADD_OTHER_OPTION) {
                              setShowSuperAddParts(true);
                              return;
                            }
                            if (value === NONE) {
                              setPart(key, NONE);
                              setPartQuantities((prev) => ({ ...prev, [key]: "1" }));
                              return;
                            }
                            const previousValue = partSelections[key] ?? NONE;
                            setPart(key, value);
                            setPendingQtyPart({ key, value, label: value, previousValue });
                            setPendingQtyInput(partQuantities[key] ?? "1");
                          }}
                          options={[
                            { value: NONE, label: NONE },
                            { value: ADD_OTHER_OPTION, label: "Add other parts" },
                            ...opts.map((o) => ({ value: o.label, label: o.label })),
                          ]}
                          className={inputClass}
                          style={{ minWidth: "8rem", flex: "1 1 auto" }}
                        />
                      </div>
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
          <ThemedSelect
            value={skinComboValue}
            onChange={(v) => setSkinComboValue(v)}
            options={[
              { value: "", label: NONE },
              ...data.skins.map((s) => ({ value: s.value, label: s.label })),
            ]}
            className={inputClass}
            style={{ maxWidth: "20rem" }}
          />
          <button
            type="button"
            onClick={applySkin}
            className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] hover:border-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)] min-h-[44px]"
          >
            Add to Gun
          </button>
        </div>
        {skinComboValue && (
          <div className="mt-3">
            <SkinPreview
              token={skinComboValue}
              label={data.skins.find((s) => s.value === skinComboValue)?.label ?? skinComboValue}
            />
          </div>
        )}
      </div>

      {/* Actions: Flag, God Roller, Add to Backpack */}
      <div className={`${blockClass} flex flex-wrap items-center gap-3`}>
        <label className={labelClass}>Select Flag</label>
        <ThemedSelect
          value={String(flagValue)}
          onChange={(v) => setFlagValue(Number(v))}
          options={FLAG_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          className={inputClass}
          style={{ width: "10rem" }}
        />
        <button
          type="button"
          onClick={openGodRoller}
          className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] hover:border-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)] min-h-[44px]"
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--color-bg-overlay)] p-2 sm:p-4"
          onClick={() => setGodRollModalOpen(false)}
        >
          <div
            className={`${blockClass} max-w-md w-full shadow-xl max-h-[85vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`${labelClass} mb-2`}>Choose God Roll</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              Tap a preset from the list.
            </p>
            <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] p-1">
              {data.godrolls.length === 0 ? (
                <p className="px-3 py-2 text-sm text-[var(--color-text-muted)]">No God Rolls available.</p>
              ) : (
                data.godrolls.map((g, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setGodRollSelectedIndex(i)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm min-h-[44px] ${
                      godRollSelectedIndex === i
                        ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/60"
                        : "text-[var(--color-text)] hover:bg-[rgba(48,52,60,0.5)] border border-transparent"
                    }`}
                  >
                    {g.name}
                  </button>
                ))
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              <button
                type="button"
                onClick={() => setGodRollModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={godRollAddToBackpack}
                disabled={loading !== null}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium min-h-[44px] disabled:opacity-50"
              >
                Add to Backpack
              </button>
              <button
                type="button"
                onClick={godRollCustomize}
                disabled={loading !== null}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)] min-h-[44px] disabled:opacity-50"
              >
                Customize God Roll
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Super Weapon Gen: universal extra parts picker (always visible in builder) */}
      <div className={blockClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className={labelClass}>Super Weapon Gen (Test)</label>
          <button
            type="button"
            onClick={() => setShowSuperAddParts(true)}
            className="px-4 py-2 rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-black min-h-[44px] text-sm touch-manipulation"
          >
            Add other parts…
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Use this to attach any extra universal parts (with quantity) to the current build. These parts are
          appended after normal builder parts in the decoded string.
        </p>
      </div>

      {/* Themed warning modal (used by Auto Fill prerequisites) */}
      {autoFillWarning && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--color-bg-overlay)] p-4"
          onClick={() => setAutoFillWarning(null)}
        >
          <div
            className={`${blockClass} max-w-md w-full shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`${labelClass} mb-2`}>Missing required selections</h3>
            <p className="text-sm text-[var(--color-text)]">{autoFillWarning}</p>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setAutoFillWarning(null)}
                className="px-4 py-2 rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-black min-h-[44px] touch-manipulation"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quantity prompt after selecting a part */}
      {pendingQtyPart && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-40 p-4">
          <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl p-4 w-full max-w-sm">
            <p className="text-sm text-[var(--color-text)] mb-2">
              Quantity for <span className="text-[var(--color-accent)] truncate block">{pendingQtyPart.label}</span>
            </p>
            <input
              type="number"
              min={1}
              max={99}
              value={pendingQtyInput}
              onChange={(e) => setPendingQtyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const qty = Math.max(1, Math.min(99, parseInt(pendingQtyInput.trim(), 10) || 1));
                  setPartQuantities((prev) => ({ ...prev, [pendingQtyPart.key]: String(qty) }));
                  setPendingQtyPart(null);
                }
                if (e.key === "Escape") {
                  setPart(pendingQtyPart.key, pendingQtyPart.previousValue);
                  setPendingQtyPart(null);
                }
              }}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] mb-3 min-h-[44px]"
              autoFocus
            />
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPart(pendingQtyPart.key, pendingQtyPart.previousValue);
                  setPendingQtyPart(null);
                }}
                className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] min-h-[44px] text-sm touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const qty = Math.max(1, Math.min(99, parseInt(pendingQtyInput.trim(), 10) || 1));
                  setPartQuantities((prev) => ({ ...prev, [pendingQtyPart.key]: String(qty) }));
                  setPendingQtyPart(null);
                }}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium hover:opacity-90 min-h-[44px] text-sm touch-manipulation"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Super Weapon Gen universal parts modal */}
      {showSuperAddParts && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-40 p-2 sm:p-4">
          <div className="max-h-[85dvh] sm:max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl flex flex-col">
            <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
              <h3 className="text-[var(--color-accent)] font-medium text-sm">Add Other Parts</h3>
              <button
                type="button"
                onClick={() => setShowSuperAddParts(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-accent)] text-sm touch-manipulation"
              >
                Close
              </button>
            </div>
            <div className="flex-1 px-4 py-3 text-sm flex flex-col gap-3 overflow-hidden min-h-0">
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={superSearch}
                  onChange={(e) => setSuperSearch(e.target.value)}
                  placeholder="Search by name, effect, manufacturer, or code…"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm focus:outline-none focus:border-[var(--color-accent)] min-h-[44px]"
                />
                <button
                  type="button"
                  onClick={() => setSuperSearch("")}
                  className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] text-sm min-h-[44px] touch-manipulation"
                >
                  Clear
                </button>
              </div>
              {/* Quick filters: Manufacturer, Rarity (includes Pearl) */}
              {(() => {
                const manufacturers = [...new Set(superParts.map((p) => p.manufacturer).filter(Boolean))].sort();
                const raritySet = new Set<string>();
                superParts.forEach((p) => {
                  const n = normalizeSuperRarity(p.rarity);
                  if (n) raritySet.add(n);
                });
                const rarities = [...raritySet].sort((a, b) => {
                  if (a === "Pearl") return -1;
                  if (b === "Pearl") return 1;
                  if (a === "Legendary") return -1;
                  if (b === "Legendary") return 1;
                  return a.localeCompare(b);
                });
                return (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="text-[var(--color-text-muted)] text-xs shrink-0">Quick filters:</span>
                    <select
                      value={superManufacturerFilter}
                      onChange={(e) => setSuperManufacturerFilter(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm focus:outline-none focus:border-[var(--color-accent)] min-h-[44px]"
                      title="Filter by manufacturer"
                    >
                      <option value="">All manufacturers</option>
                      {manufacturers.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <select
                      value={superRarityFilter}
                      onChange={(e) => setSuperRarityFilter(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm focus:outline-none focus:border-[var(--color-accent)] min-h-[44px]"
                      title="Filter by rarity"
                    >
                      <option value="">All rarities</option>
                      {rarities.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}
              <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-0">
                {superParts
                  .map((p, realIdx) => ({ p, realIdx }))
                  .filter(({ p }) => {
                    if (superManufacturerFilter && (p.manufacturer ?? "") !== superManufacturerFilter) return false;
                    if (!superPartMatchesRarity(p.rarity, superRarityFilter)) return false;
                    const q = superSearch.trim().toLowerCase();
                    if (!q) return true;
                    const haystack = [
                      p.label,
                      p.code,
                      p.effect ?? "",
                      p.itemType ?? "",
                      p.manufacturer ?? "",
                      p.partType ?? "",
                      p.rarity ?? "",
                    ]
                      .join(" ")
                      .toLowerCase();
                    return haystack.includes(q);
                  })
                  .map(({ p, realIdx }) => (
                    <div
                      key={`${p.code}-${realIdx}`}
                      role="button"
                      tabIndex={0}
                      className="flex items-center gap-2 cursor-pointer rounded px-3 py-2 -mx-1 hover:bg-[rgba(255,255,255,0.06)] focus:outline-none focus:bg-[rgba(255,255,255,0.06)] min-h-[44px] items-center touch-manipulation"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("input")) return;
                        setSuperParts((prev) =>
                          prev.map((s, i) => (i === realIdx ? { ...s, checked: !s.checked } : s)),
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        setSuperParts((prev) =>
                          prev.map((s, i) => (i === realIdx ? { ...s, checked: !s.checked } : s)),
                        );
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={p.checked}
                        onChange={() =>
                          setSuperParts((prev) =>
                            prev.map((s, i) => (i === realIdx ? { ...s, checked: !s.checked } : s)),
                          )
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 w-5 h-5 cursor-pointer"
                        style={{ accentColor: "var(--color-accent)" }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">
                          {p.label}{" "}
                          <span className="text-[var(--color-text-muted)]">
                            ({p.code}
                            {p.rarity ? ` · ${p.rarity}` : ""}{p.itemType ? ` · ${p.itemType}` : ""}
                            {p.manufacturer ? ` · ${p.manufacturer}` : ""})
                          </span>
                        </div>
                        {p.effect && (
                          <div className="text-xs text-[var(--color-accent)] mt-0.5 truncate" title={p.effect}>
                            {p.effect.length > 90
                              ? `…${p.effect.slice(-86)}`
                              : p.effect}
                          </div>
                        )}
                      </div>
                      {p.checked && (
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={p.qty}
                          onChange={(e) => {
                            const v = e.target.value;
                            setSuperParts((prev) =>
                              prev.map((s, i) => (i === realIdx ? { ...s, qty: v } : s)),
                            );
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-16 px-2 py-1.5 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      )}
                    </div>
                  ))}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-[var(--color-panel-border)] flex flex-wrap justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowSuperAddParts(false)}
                className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] min-h-[44px] text-sm touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowSuperAddParts(false)}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium hover:opacity-90 min-h-[44px] text-sm touch-manipulation"
              >
                Confirm Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
