import { useState, useCallback, useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { parse as yamlParse } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import { getBackpackSlotsWithPaths, type ItemSlotWithPath } from "@/lib/inventoryData";
import { fetchApi, getApiUnavailableError, isLikelyUnavailable } from "@/lib/apiClient";
import CleanCodeDialog from "@/components/weapon-toolbox/CleanCodeDialog";
import SkinPreview from "@/components/weapon-toolbox/SkinPreview";

const WEAPON_TYPES = new Set(["Pistol", "Shotgun", "SMG", "Assault Rifle", "Sniper"]);

const FLAG_OPTIONS = [
  { value: 1, label: "1 (Normal)" },
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 17, label: "17" },
  { value: 33, label: "33" },
  { value: 65, label: "65" },
  { value: 129, label: "129" },
];

interface DecodedBackpackWeapon {
  slot: ItemSlotWithPath;
  serial: string;
  decodedFull: string;
  manufacturer?: string;
  itemType?: string;
  name?: string;
  level?: number;
}

interface WeaponGenData {
  mfgWtIdList?: { manufacturer: string; weaponType: string; mfgWtId: string }[];
  partsByMfgTypeId?: Record<string, Record<string, { partId: string; label: string }[]>>;
  elemental?: { partId: string; stat: string }[];
  skins: { label: string; value: string }[];
}

interface WeaponEditPartRow {
  mfgWtId: string;
  manufacturer: string;
  weaponType: string;
  partId: string;
  partType: string;
  string: string;
  stat: string;
}

interface WeaponEditElementalRow {
  elementalId: string;
  partId: string;
  stat: string;
}

interface WeaponEditData {
  parts: WeaponEditPartRow[];
  elemental: WeaponEditElementalRow[];
}

type ParsedComponent =
  | string
  | { type: "skin"; id: number; raw: string }
  | { type: "elemental"; id: number; subId: number; raw: string }
  | { type: "group"; id: number; subIds: number[]; raw: string }
  | { type: "part"; mfgId: number; id: number; raw: string }
  | { type: "simple"; id: number; raw: string };

interface AddPartSelection {
  id: string;
  mfgWtId: string;
  manufacturer: string;
  weaponType: string;
  type: "normal" | "elemental";
  checked: boolean;
  qty: string;
  label: string;
}

interface UniversalDbPartCode {
  code: string;
  partType?: string;
  rarity?: string;
  itemType?: string;
  manufacturer?: string;
  statText?: string;
}

function parseComponentString(componentStr: string): ParsedComponent[] {
  const out: ParsedComponent[] = [];
  const regex = /\{(\d+)(?::(\d+|\[[\d\s]+\]))?\}|"c",\s*(\d+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(componentStr)) !== null) {
    if (match.index > lastIndex) {
      out.push(componentStr.slice(lastIndex, match.index));
    }
    const raw = match[0];
    if (match[3]) {
      out.push({ type: "skin", id: Number(match[3]), raw });
    } else {
      const outerId = Number(match[1]);
      const inner = match[2];
      if (inner) {
        if (inner.includes("[")) {
          const subIds = inner
            .replace("[", "")
            .replace("]", "")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((v) => Number(v));
          out.push({ type: "group", id: outerId, subIds, raw });
        } else {
          if (outerId === 1) {
            out.push({ type: "elemental", id: outerId, subId: Number(inner), raw });
          } else {
            out.push({ type: "part", mfgId: outerId, id: Number(inner), raw });
          }
        }
      } else {
        out.push({ type: "simple", id: outerId, raw });
      }
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < componentStr.length) {
    out.push(componentStr.slice(lastIndex));
  }
  return out.filter((c) => (typeof c === "string" ? c.trim() !== "" : true));
}

function buildPartStringsFromSelections(
  selections: AddPartSelection[],
  currentWeaponMfgId: number,
): string[] {
  const partsByMfg = new Map<number, { id: number; type: "normal" | "elemental" }[]>();
  for (const sel of selections) {
    if (!sel.checked) continue;
    const mfgId = sel.type === "elemental" ? 1 : Number(sel.mfgWtId || "0") || 0;
    if (!partsByMfg.has(mfgId)) partsByMfg.set(mfgId, []);
    const list = partsByMfg.get(mfgId)!;
    const qty = sel.qty.trim();
    let count = 1;
    if (qty && /^\d+$/.test(qty)) count = Math.max(1, Math.min(99, Number(qty)));
    if (sel.type === "elemental") {
      for (let i = 0; i < count; i++) {
        list.push({ id: Number(sel.id), type: "elemental" });
      }
    } else {
      for (let i = 0; i < count; i++) {
        list.push({ id: Number(sel.id), type: "normal" });
      }
    }
  }
  const newParts: string[] = [];
  const entries = Array.from(partsByMfg.entries());
  for (const [mfgId, parts] of entries) {
    const elemental = parts.filter((p) => p.type === "elemental").map((p) => p.id);
    const normal = parts.filter((p) => p.type === "normal").map((p) => p.id);
    if (mfgId === 1) {
      newParts.push(...elemental.map((id) => `{1:${id}}`));
    } else if (mfgId === currentWeaponMfgId) {
      newParts.push(...normal.map((id) => `{${id}}`));
    } else if (normal.length) {
      const sorted = [...normal].sort((a, b) => a - b);
      newParts.push(`{${mfgId}:[${sorted.join(" ")}]}`);
    }
  }
  return newParts;
}

export default function WeaponEditView() {
  const location = useLocation();
  const { saveData, getYamlText, updateSaveData } = useSave();

  const [serialInput, setSerialInput] = useState("");
  const [decodedInput, setDecodedInput] = useState("");
  const [encodedSerial, setEncodedSerial] = useState("");
  const [newWeaponLevel, setNewWeaponLevel] = useState("50");
  const [modPowerMode, setModPowerMode] = useState<"stable" | "op" | "insane">("op");
  const [flagValue, setFlagValue] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<"decode" | "encode" | "add" | "update" | "backpack" | null>(null);

  /** When set, we have a weapon loaded from backpack; Update Weapon will write to this path. */
  const [selectedWeaponPath, setSelectedWeaponPath] = useState<string[] | null>(null);
  const [backpackWeapons, setBackpackWeapons] = useState<DecodedBackpackWeapon[]>([]);
  const [skinOptions, setSkinOptions] = useState<WeaponGenData["skins"]>([]);
  const [skinComboValue, setSkinComboValue] = useState("");
  const [weaponEditData, setWeaponEditData] = useState<WeaponEditData | null>(null);
  const [parsedComponents, setParsedComponents] = useState<ParsedComponent[]>([]);
  const [currentMfgWtId, setCurrentMfgWtId] = useState<number | null>(null);
  const [showAddPart, setShowAddPart] = useState(false);
  const [addPartSelections, setAddPartSelections] = useState<AddPartSelection[]>([]);
  const [selectedWeaponTypeFilter, setSelectedWeaponTypeFilter] = useState<string | null>(null);
  const [selectedManufacturerFilter, setSelectedManufacturerFilter] = useState<string | null>(null);
  /** Fallback from master search DB when weapon CSV has no row (avoids empty rows). */
  const [universalFallback, setUniversalFallback] = useState<Record<string, { partType: string; string: string; stat: string }>>({});
  const [showCleanCode, setShowCleanCode] = useState(false);
  const [universalPartCodes, setUniversalPartCodes] = useState<UniversalDbPartCode[]>([]);

  useEffect(() => {
    const state = location.state as { pasteDecoded?: string; loadItem?: { serial?: string; decodedFull?: string; path?: string[] } } | null;
    const paste = state?.pasteDecoded;
    if (typeof paste === "string" && paste.trim()) {
      setDecodedInput(paste.trim());
    }
    const loadItem = state?.loadItem;
    if (loadItem && typeof loadItem === "object") {
      if (typeof loadItem.serial === "string" && loadItem.serial.trim()) {
        setSerialInput(loadItem.serial.trim());
      }
      if (typeof loadItem.decodedFull === "string" && loadItem.decodedFull.trim()) {
        setDecodedInput(loadItem.decodedFull.trim());
      }
      if (Array.isArray(loadItem.path) && loadItem.path.length > 0) {
        setSelectedWeaponPath(loadItem.path);
      }
      setEncodedSerial("");
      setMessage("Item loaded from backpack. Edit and click Update Weapon to save.");
    }
  }, [location.state]);

  // Whenever decodedInput changes, keep parsedComponents + currentMfgWtId in sync.
  useEffect(() => {
    const decoded = decodedInput.trim();
    if (!decoded || !decoded.includes("||")) {
      setParsedComponents([]);
      setCurrentMfgWtId(null);
      return;
    }
    const [header, component] = decoded.split("||", 2);
    const headerPart = header.trim().split("|")[0]?.split(",")[0];
    const mId = Number(headerPart);
    setCurrentMfgWtId(Number.isFinite(mId) ? mId : null);
    const base = parseComponentString(component);
    const flattened: ParsedComponent[] = [];
    base.forEach((c) => {
      if (typeof c === "string") {
        flattened.push(c);
      } else if (c.type === "group") {
        c.subIds.forEach((sid) => {
          flattened.push({
            type: "part",
            mfgId: c.id,
            id: sid,
            raw: `{${c.id}:${sid}}`,
          });
        });
      } else if (c.type === "part") {
        flattened.push(c);
      } else if (c.type === "elemental") {
        flattened.push(c);
      } else if (c.type === "simple") {
        const useMfg = Number.isFinite(mId) ? mId : c.id;
        flattened.push({
          type: "part",
          mfgId: useMfg,
          id: c.id,
          raw: `{${useMfg}:${c.id}}`,
        });
      }
    });
    setParsedComponents(flattened);
  }, [decodedInput]);

  useEffect(() => {
    fetchApi("weapon-gen/data")
      .then((r) => r.json())
      .then((d: WeaponGenData) => setSkinOptions(d?.skins ?? []))
      .catch(() => setSkinOptions([]));
  }, []);

  useEffect(() => {
    fetchApi("weapon-edit/data")
      .then((r) => r.json())
      .then((d: WeaponEditData) => setWeaponEditData(d))
      .catch(() => setWeaponEditData(null));
  }, []);

  useEffect(() => {
    fetchApi("parts/data")
      .then((r) => r.json())
      .then((d: { items?: unknown[] }) => {
        const items = Array.isArray(d?.items) ? d.items : [];
        const out: UniversalDbPartCode[] = [];
        for (const it of items) {
          if (!it || typeof it !== "object") continue;
          const raw = it as Record<string, unknown>;
          const code = String(raw.code ?? raw.Code ?? "").trim();
          if (!code) continue;
          out.push({
            code,
            partType: String(raw.partType ?? raw["Part Type"] ?? raw.canonicalPartType ?? "").trim(),
            rarity: String(raw.rarity ?? raw.Rarity ?? raw.canonicalRarity ?? "").trim(),
            itemType: String(raw.itemType ?? raw["Item Type"] ?? raw["Weapon Type"] ?? "").trim(),
            manufacturer: String(raw.manufacturer ?? raw.Manufacturer ?? raw.canonicalManufacturer ?? "").trim(),
            statText: [
              raw.effect,
              raw.Effect,
              raw.stat,
              raw.Stat,
              raw.stats,
              raw.Stats,
              raw.string,
              raw.String,
              raw.partName,
              raw.name,
              raw["Search Text"],
            ]
              .map((v) => String(v ?? "").trim())
              .filter(Boolean)
              .join(" "),
          });
        }
        setUniversalPartCodes(out);
      })
      .catch(() => setUniversalPartCodes([]));
  }, []);

  /** Fetch master-search fallback for parts not in weapon CSV so we never show empty rows. */
  useEffect(() => {
    if (!weaponEditData || parsedComponents.length === 0) {
      setUniversalFallback({});
      return;
    }
    const codes: string[] = [];
    for (const p of parsedComponents) {
      if (typeof p === "string") continue;
      if (p.type === "skin" || p.type === "group") continue;
      if (p.type === "elemental") {
        const found = weaponEditData.elemental.find((e) => Number(e.partId) === p.subId);
        if (!found) {
          const code = `{1:${p.subId}}`;
          if (!codes.includes(code)) codes.push(code);
        }
      } else if (p.type === "part" || p.type === "simple") {
        const mfgId = p.type === "part" ? p.mfgId : currentMfgWtId;
        const row = weaponEditData.parts.find(
          (r) => Number(r.mfgWtId) === mfgId && Number(r.partId) === p.id,
        );
        if (!row && mfgId != null) {
          const code = `{${mfgId}:${p.id}}`;
          if (!codes.includes(code)) codes.push(code);
        }
      }
    }
    if (codes.length === 0) {
      setUniversalFallback({});
      return;
    }
    fetchApi("parts/lookup-bulk", {
      method: "POST",
      body: JSON.stringify({ codes }),
    })
      .then((r) => r.json())
      .then((data: Record<string, { partName?: string; itemType?: string; partType?: string; effect?: string } | null>) => {
        const next: Record<string, { partType: string; string: string; stat: string }> = {};
        for (const [code, row] of Object.entries(data)) {
          if (row) {
            next[code] = {
              partType: row.partType ?? row.itemType ?? "",
              string: row.partName ?? "",
              stat: row.effect ?? "",
            };
          }
        }
        setUniversalFallback(next);
      })
      .catch(() => setUniversalFallback({}));
  }, [weaponEditData, currentMfgWtId, parsedComponents]);

  const loadBackpackWeapons = useCallback(async () => {
    if (!saveData) {
      setBackpackWeapons([]);
      setMessage("Load a save first (Character → Select Save) to list backpack weapons.");
      return;
    }
    const slots = getBackpackSlotsWithPaths(saveData);
    const serials = slots.map((s) => s.serial).filter((s) => s?.trim().startsWith("@U"));
    if (serials.length === 0) {
      setBackpackWeapons([]);
      setMessage("No items in backpack.");
      return;
    }
    setLoading("backpack");
    setMessage(null);
    try {
      const res = await fetchApi("save/decode-items", {
        method: "POST",
        body: JSON.stringify({ serials }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(isLikelyUnavailable(res) ? getApiUnavailableError() : (data?.error ?? "Decode failed"));
        setBackpackWeapons([]);
        return;
      }
      const items = data?.items ?? [];
      const slotBySerial = new Map(slots.map((s) => [s.serial, s]));
      const weapons: DecodedBackpackWeapon[] = [];
      items.forEach((item: { serial?: string; error?: string; decodedFull?: string; itemType?: string; manufacturer?: string; name?: string; level?: number }, i: number) => {
        if (item.error || !item.serial) return;
        if (!WEAPON_TYPES.has(String(item.itemType ?? ""))) return;
        const slot = slotBySerial.get(item.serial) ?? slots[i];
        if (!slot || !("path" in slot)) return;
        weapons.push({
          slot: slot as ItemSlotWithPath,
          serial: item.serial,
          decodedFull: item.decodedFull ?? "",
          manufacturer: item.manufacturer,
          itemType: item.itemType,
          name: item.name,
          level: item.level,
        });
      });
      setBackpackWeapons(weapons);
      setMessage(weapons.length === 0 ? "No weapons in backpack." : null);
    } catch {
      setMessage(getApiUnavailableError());
      setBackpackWeapons([]);
    } finally {
      setLoading(null);
    }
  }, [saveData]);

  useEffect(() => {
    if (!saveData) {
      setBackpackWeapons([]);
      return;
    }
    loadBackpackWeapons();
  }, [saveData, loadBackpackWeapons]);

  const handleLoadWeapon = useCallback((w: DecodedBackpackWeapon) => {
    setSerialInput(w.serial);
    setDecodedInput(w.decodedFull);
    setEncodedSerial("");
    setSelectedWeaponPath(w.slot.path);
    setMessage("Weapon loaded. Edit and click Update Weapon to save in place, or Encode then Add to Backpack for a copy.");
  }, []);

  const handleDecode = useCallback(async () => {
    const raw = serialInput.trim();
    if (!raw || !raw.startsWith("@U")) {
      setMessage("Paste a Base85 serial (must start with @U).");
      return;
    }
    setLoading("decode");
    setMessage(null);
    setSelectedWeaponPath(null);
    try {
      const res = await fetchApi("save/decode-items", {
        method: "POST",
        body: JSON.stringify({ serials: [raw] }),
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
        setDecodedInput(first.decodedFull);
        setEncodedSerial("");
        setMessage("Decoded. Edit below and click Encode to Base85 or Update Weapon if loaded from backpack.");
      } else {
        setMessage("No decoded string in response.");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [serialInput]);

  const handleEncode = useCallback(async () => {
    const decoded = decodedInput.trim();
    if (!decoded) {
      setMessage("Enter or paste a deserialized (decoded) string.");
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
      if (!res.ok) {
        setMessage(isLikelyUnavailable(res) ? getApiUnavailableError() : (data?.error ?? "Encode failed"));
        return;
      }
      if (data?.success && typeof data?.serial === "string") {
        setEncodedSerial(data.serial);
        setSerialInput(data.serial);
        setMessage("Encoded. Copy serial or Add to Backpack.");
      } else {
        setMessage(data?.error ?? "Encode failed");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [decodedInput]);

  const handleUpdateWeapon = useCallback(async () => {
    if (!selectedWeaponPath || selectedWeaponPath.length === 0) {
      setMessage("Load a weapon from backpack first, then edit and click Update Weapon.");
      return;
    }
    const decoded = decodedInput.trim();
    if (!decoded) {
      setMessage("Decoded string is empty.");
      return;
    }
    if (!saveData) {
      setMessage("Load a save first.");
      return;
    }
    const yamlContent = getYamlText();
    if (!yamlContent.trim()) {
      setMessage("No save YAML loaded.");
      return;
    }
    setLoading("update");
    setMessage(null);
    try {
      const res = await fetchApi("save/encode-serial", {
        method: "POST",
        body: JSON.stringify({ decoded_string: decoded }),
      });
      const encData = await res.json().catch(() => ({}));
      if (!res.ok || !encData?.success || typeof encData?.serial !== "string") {
        setMessage(encData?.error ?? "Encode failed");
        return;
      }
      const updateRes = await fetchApi("save/update-item", {
        method: "POST",
        body: JSON.stringify({
          yaml_content: yamlContent,
          item_path: selectedWeaponPath,
          new_item_data: { serial: encData.serial },
        }),
      });
      const updateJson = await updateRes.json().catch(() => ({}));
      if (!updateRes.ok) {
        setMessage(updateJson?.error ?? "Update failed");
        return;
      }
      if (updateJson?.success && typeof updateJson?.yaml_content === "string") {
        const parsed = yamlParse(updateJson.yaml_content) as Record<string, unknown>;
        updateSaveData(parsed);
        setSerialInput(encData.serial);
        setEncodedSerial(encData.serial);
        setMessage("Weapon updated in backpack. Use Download .sav on Select Save to export.");
      } else {
        setMessage(updateJson?.error ?? "Update failed");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [selectedWeaponPath, decodedInput, saveData, getYamlText, updateSaveData]);

  const handleAddToBackpack = useCallback(async () => {
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
      let serial = encodedSerial.trim() || serialInput.trim();
      if (!serial.startsWith("@U")) {
        const decoded = decodedInput.trim();
        if (!decoded) {
          setMessage("Generate or decode a weapon first (no serial/decoded data to add).");
          return;
        }
        const encRes = await fetchApi("save/encode-serial", {
          method: "POST",
          body: JSON.stringify({ decoded_string: decoded }),
        });
        const encData = await encRes.json().catch(() => ({}));
        if (!encRes.ok || !encData?.success || typeof encData?.serial !== "string") {
          setMessage(
            isLikelyUnavailable(encRes)
              ? getApiUnavailableError()
              : (encData?.error ?? "Auto-encode failed before Add to Backpack."),
          );
          return;
        }
        serial = encData.serial;
        setEncodedSerial(serial);
        setSerialInput(serial);
      }

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
        setMessage("Item added to backpack. Use Download .sav on Select Save to export.");
      } else {
        setMessage(data?.error ?? "Add failed");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [encodedSerial, serialInput, decodedInput, saveData, flagValue, getYamlText, updateSaveData]);

  const handleSkinAddToGun = useCallback(() => {
    const skinValue = skinComboValue?.trim();
    if (!skinValue) {
      setMessage("Select a skin first.");
      return;
    }
    const decoded = decodedInput.trim();
    if (!decoded) {
      setMessage("Paste or decode a weapon first.");
      return;
    }
    const safe = skinValue.replace(/"/g, '\\"');
    const withoutTrailingSkin = decoded.replace(/\|\s*"c",\s*"(?:[^"\\]|\\.)*"\s*\|?\s*$/i, " |");
    const normalized = withoutTrailingSkin.trim().endsWith("|")
      ? withoutTrailingSkin.trim()
      : `${withoutTrailingSkin.trim()} |`;
    const updated = normalized.replace(/\|\s*$/, `| "c", "${safe}" |`);
    setDecodedInput(updated);
    setMessage("Skin appended to decoded string. Click Encode or Update Weapon to apply.");
  }, [skinComboValue, decodedInput]);

  const handleOpenAddPart = useCallback(() => {
    if (!decodedInput.trim() || !weaponEditData || currentMfgWtId == null) {
      setMessage("Load and decode a weapon first.");
      return;
    }
    const sels: AddPartSelection[] = [];
    // Elemental category
    weaponEditData.elemental.forEach((row) => {
      sels.push({
        id: row.partId,
        mfgWtId: "1",
        manufacturer: "Elemental",
        weaponType: "Elemental",
        type: "elemental",
        checked: false,
        qty: "1",
        label: `${row.elementalId}:${row.partId} | ${row.stat}`,
      });
    });
    // Weapon parts grouped by weapon type & manufacturer (simple flat list for now)
    weaponEditData.parts.forEach((row) => {
      sels.push({
        id: row.partId,
        mfgWtId: row.mfgWtId,
        manufacturer: row.manufacturer,
        weaponType: row.weaponType,
        type: "normal",
        checked: false,
        qty: "1",
        label: `${row.partId} | ${row.partType} | ${row.string}${
          row.stat ? ` | ${row.stat}` : ""
        }`,
      });
    });
    setAddPartSelections(sels);
    // Default filters: first real weapon type, or Elemental
    const weaponTypes = Array.from(
      new Set(weaponEditData.parts.map((p) => p.weaponType).filter((w) => w)),
    );
    setSelectedWeaponTypeFilter(weaponTypes[0] ?? "Elemental");
    setSelectedManufacturerFilter(null);
    setShowAddPart(true);
  }, [decodedInput, weaponEditData, currentMfgWtId]);

  const handleToggleSelection = useCallback((index: number) => {
    setAddPartSelections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, checked: !s.checked } : s)),
    );
  }, []);

  const handleQtyChange = useCallback((index: number, value: string) => {
    setAddPartSelections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, qty: value } : s)),
    );
  }, []);

  const handleConfirmAddParts = useCallback(() => {
    if (!decodedInput.trim() || currentMfgWtId == null) {
      setShowAddPart(false);
      return;
    }
    const selected = addPartSelections.filter((s) => s.checked);
    if (!selected.length) {
      setShowAddPart(false);
      return;
    }
    const newParts = buildPartStringsFromSelections(selected, currentMfgWtId);
    if (!newParts.length) {
      setShowAddPart(false);
      return;
    }
    const [, componentPart = ""] = decodedInput.split("||", 2);
    const baseHeader = decodedInput.split("||", 1)[0];
    const newPartData = parseComponentString(newParts.join(" "));
    const partsData = parseComponentString(componentPart);
    let insertionIndex = partsData.length;
    for (let i = partsData.length - 1; i >= 0; i -= 1) {
      const p = partsData[i];
      if (typeof p === "string") continue;
      if (p.type !== "skin") {
        insertionIndex = i + 1;
        break;
      }
    }
    if (insertionIndex > 0) {
      const prevItem = partsData[insertionIndex - 1];
      if (typeof prevItem !== "string" || prevItem.trim()) {
        partsData.splice(insertionIndex, 0, " ");
        insertionIndex += 1;
      }
    }
    partsData.splice(insertionIndex, 0, ...newPartData);
    const newComponentStr = partsData
      .map((p) => (typeof p === "string" ? p : p.raw))
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
    const updatedDecoded = `${baseHeader.trim()}|| ${newComponentStr}`;
    setDecodedInput(updatedDecoded);
    setParsedComponents(partsData);
    setShowAddPart(false);
    setMessage("Parts added. Click Encode or Update Weapon to apply.");
  }, [addPartSelections, currentMfgWtId, decodedInput]);

  const parseCodePair = useCallback((code: string): { prefix: number; part: number } | null => {
    const s = code.trim();
    const m2 = s.match(/^\{\s*(\d+)\s*:\s*(\d+)\s*\}$/);
    if (m2) return { prefix: Number(m2[1]), part: Number(m2[2]) };
    const m1 = s.match(/^\{\s*(\d+)\s*\}$/);
    if (m1) {
      const n = Number(m1[1]);
      return { prefix: n, part: n };
    }
    return null;
  }, []);

  const handleRandomModdedWeapon = useCallback(async () => {
    if (!weaponEditData) {
      setMessage("Weapon parts data is still loading. Try again in a moment.");
      return;
    }
    if (!universalPartCodes.length) {
      setMessage("Universal parts DB data is still loading. Try again in a moment.");
      return;
    }
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
    const modeCfg = {
      stable: {
        exemplarCycleRepeats: [8, 24] as const,
        exemplarAmmoCount: [12, 48] as const,
        exemplarFireCount: [10, 36] as const,
        useStabilityGroupChance: 0.7,
        bodyAccRange: [4, 8] as const,
        barrelAccRange: [4, 8] as const,
        extraBarrelsRange: [4, 10] as const,
        crossBarrelRange: [2, 5] as const,
        grenadePerkRange: [16, 52] as const,
        underAccRange: [1, 3] as const,
        statRange: [2, 6] as const,
      },
      op: {
        exemplarCycleRepeats: [16, 72] as const,
        exemplarAmmoCount: [24, 140] as const,
        exemplarFireCount: [18, 90] as const,
        useStabilityGroupChance: 0.45,
        bodyAccRange: [4, 12] as const,
        barrelAccRange: [4, 12] as const,
        extraBarrelsRange: [8, 22] as const,
        crossBarrelRange: [4, 10] as const,
        grenadePerkRange: [24, 120] as const,
        underAccRange: [1, 6] as const,
        statRange: [3, 10] as const,
      },
      insane: {
        exemplarCycleRepeats: [56, 180] as const,
        exemplarAmmoCount: [120, 420] as const,
        exemplarFireCount: [90, 320] as const,
        useStabilityGroupChance: 0.85,
        bodyAccRange: [8, 20] as const,
        barrelAccRange: [8, 24] as const,
        extraBarrelsRange: [18, 48] as const,
        crossBarrelRange: [8, 20] as const,
        grenadePerkRange: [80, 280] as const,
        underAccRange: [3, 10] as const,
        statRange: [8, 20] as const,
      },
    }[modPowerMode];

    const candidates = universalPartCodes
      .map((row) => ({ row, parsed: parseCodePair(row.code) }))
      .filter((x): x is { row: UniversalDbPartCode; parsed: { prefix: number; part: number } } => x.parsed != null);

    const isLegendary = (row: { stat?: string; string?: string }) =>
      /legendary/.test(norm(`${row.stat ?? ""} ${row.string ?? ""}`));

    // Prefer prefixes with legendary barrel+rarity, but never hard-fail generation
    // when DB labeling is inconsistent.
    const weaponRowsByPrefix = new Map<number, WeaponEditPartRow[]>();
    for (const row of weaponEditData.parts) {
      const pfx = Number(row.mfgWtId);
      if (!Number.isFinite(pfx)) continue;
      if (!weaponRowsByPrefix.has(pfx)) weaponRowsByPrefix.set(pfx, []);
      weaponRowsByPrefix.get(pfx)!.push(row);
    }
    const legendaryBarrelIdsByPrefix = new Map<number, Set<number>>();
    const legendaryRarityIdsByPrefix = new Map<number, Set<number>>();
    for (const c of candidates) {
      const pt = norm(c.row.partType);
      const r = norm(c.row.rarity);
      if (r !== "legendary") continue;
      if (pt === "barrel") {
        if (!legendaryBarrelIdsByPrefix.has(c.parsed.prefix)) legendaryBarrelIdsByPrefix.set(c.parsed.prefix, new Set());
        legendaryBarrelIdsByPrefix.get(c.parsed.prefix)!.add(c.parsed.part);
      } else if (pt === "rarity") {
        if (!legendaryRarityIdsByPrefix.has(c.parsed.prefix)) legendaryRarityIdsByPrefix.set(c.parsed.prefix, new Set());
        legendaryRarityIdsByPrefix.get(c.parsed.prefix)!.add(c.parsed.part);
      }
    }
    const hasCoreParts = (prefix: number): boolean => {
      const rows = weaponRowsByPrefix.get(prefix) ?? [];
      const hasBody = rows.some((r) => norm(r.partType) === "body");
      const hasBarrel = rows.some((r) => norm(r.partType) === "barrel");
      const hasMagazine = rows.some((r) => norm(r.partType) === "magazine");
      return hasBody && hasBarrel && hasMagazine;
    };
    const validPrefixesLegendary = Array.from(weaponRowsByPrefix.keys()).filter((p) => {
      const rows = weaponRowsByPrefix.get(p) ?? [];
      const partIds = new Set(
        rows.map((r) => Number(r.partId)).filter((n) => Number.isFinite(n)),
      );
      const barrelSet = legendaryBarrelIdsByPrefix.get(p) ?? new Set<number>();
      const raritySet = legendaryRarityIdsByPrefix.get(p) ?? new Set<number>();
      const hasLegendaryBarrel =
        Array.from(barrelSet).some((id) => partIds.has(id)) ||
        rows.some((r) => norm(r.partType) === "barrel" && isLegendary(r));
      const hasLegendaryRarity =
        Array.from(raritySet).some((id) => partIds.has(id)) ||
        rows.some((r) => norm(r.partType) === "rarity" && isLegendary(r));
      return hasCoreParts(p) && hasLegendaryBarrel && hasLegendaryRarity;
    });
    const validPrefixesFallback = Array.from(weaponRowsByPrefix.keys()).filter((p) => {
      const rows = weaponRowsByPrefix.get(p) ?? [];
      const hasAnyRarity = rows.some((r) => norm(r.partType) === "rarity");
      const hasAnyBarrel = rows.some((r) => norm(r.partType) === "barrel");
      return hasCoreParts(p) && hasAnyRarity && hasAnyBarrel;
    });
    const validPrefixes = validPrefixesLegendary.length ? validPrefixesLegendary : validPrefixesFallback;
    if (!validPrefixes.length) {
      setMessage("No valid weapon prefix has required core parts and barrel/rarity.");
      return;
    }
    const headerPrefix = pick(validPrefixes);
    const seed = String(randInt(1000, 9999));
    const parsedLevel = Number(newWeaponLevel.trim());
    const level = Number.isFinite(parsedLevel) ? Math.max(1, Math.min(255, Math.trunc(parsedLevel))) : 50;

    const weaponRows = weaponEditData.parts.filter((r) => Number(r.mfgWtId) === headerPrefix);
    // Rule 2: first code must be legendary rarity for the weapon prefix.
    const legendaryRarityRows = weaponRows.filter(
      (r) => norm(r.partType) === "rarity" && /legendary/.test(norm(`${r.stat} ${r.string}`)),
    );
    const validCurrentPartIds = new Set(weaponRows.map((r) => Number(r.partId)).filter((n) => Number.isFinite(n)));
    const mappedLegendaryRarityIds = Array.from(legendaryRarityIdsByPrefix.get(headerPrefix) ?? []).filter((id) =>
      validCurrentPartIds.has(id),
    );
    const anyRarityRows = weaponRows.filter((r) => norm(r.partType) === "rarity");
    if (!legendaryRarityRows.length && !mappedLegendaryRarityIds.length && !anyRarityRows.length) {
      setMessage("Could not find a rarity part for selected weapon prefix.");
      return;
    }
    const firstRarityCode = legendaryRarityRows.length
      ? `{${pick(legendaryRarityRows).partId}}`
      : mappedLegendaryRarityIds.length
        ? `{${pick(mappedLegendaryRarityIds)}}`
        : `{${pick(anyRarityRows).partId}}`;

    const toPartIds = (types: string[]): number[] => {
      const set = new Set(types.map((t) => norm(t)));
      return weaponRows
        .filter((r) => set.has(norm(r.partType)))
        .map((r) => Number(r.partId))
        .filter((n) => Number.isFinite(n));
    };
    const pickToken = (types: string[]): string | null => {
      const ids = toPartIds(types);
      if (!ids.length) return null;
      return `{${pick(ids)}}`;
    };
    const stackTokens = (types: string[], minCount: number, maxCount: number): string[] => {
      const ids = toPartIds(types);
      if (!ids.length) return [];
      const count = randInt(minCount, maxCount);
      const out: string[] = [];
      for (let i = 0; i < count; i += 1) out.push(`{${pick(ids)}}`);
      return out;
    };
    // Required order requested:
    // rarity -> element -> body -> >=4 body accessories -> barrel -> extra barrels
    // -> >=4 barrel accessories -> magazine/grip/foregrip/scope/(optional manufacturer)
    // -> damage/ammo/fire stacks -> underbarrel/underbarrel accessories
    // -> grenade (for Tediore-style reload setups) -> stalker stack -> skin.
    const elementPool = weaponEditData.elemental ?? [];
    const pickedElement = elementPool.length ? pick(elementPool) : null;
    const elementToken = pickedElement && /^\d+$/.test(pickedElement.partId) ? `{1:${pickedElement.partId}}` : "";
    const bodyToken = pickToken(["body"]);
    if (!bodyToken) {
      setMessage("Could not build stock weapon core: missing Body.");
      return;
    }
    const bodyAccessoryStack = stackTokens(
      ["body accessory"],
      modeCfg.bodyAccRange[0],
      modeCfg.bodyAccRange[1],
    );
    if (toPartIds(["body accessory"]).length > 0 && bodyAccessoryStack.length < 4) {
      setMessage("Could not build stock weapon core: missing enough Body Accessory parts.");
      return;
    }

    // Extra stat-focused stacks from DB text:
    // damage, magazine/ammo, and fire rate.
    const nonRarityCandidates = candidates.filter(({ row }) => norm(row.partType) !== "rarity");
    const addStatStacks = (
      matcher: (text: string) => boolean,
      minCount: number,
      maxCount: number,
    ): string[] => {
      const local = nonRarityCandidates.filter(
        ({ row, parsed }) =>
          parsed.prefix === headerPrefix &&
          validCurrentPartIds.has(parsed.part) &&
          matcher(norm(row.statText)),
      );
      const fallback = nonRarityCandidates.filter(({ row }) => matcher(norm(row.statText)));
      const pool = local.length ? local : fallback;
      if (!pool.length) return [];

      const outTokens: string[] = [];
      const byPrefix = new Map<number, number[]>();
      const picks = randInt(minCount, maxCount);
      for (let i = 0; i < picks; i += 1) {
        const c = pick(pool);
        const pfx = c.parsed.prefix;
        if (pfx === headerPrefix) outTokens.push(`{${c.parsed.part}}`);
        else {
          if (!byPrefix.has(pfx)) byPrefix.set(pfx, []);
          byPrefix.get(pfx)!.push(c.parsed.part);
        }
      }
      for (const [pfx, ids] of byPrefix.entries()) {
        if (!ids.length) continue;
        outTokens.push(`{${pfx}:[${ids.join(" ")}]}`);
      }
      return outTokens;
    };
    const repeatPattern = (ids: number[], repeats: number): number[] => {
      const out: number[] = [];
      for (let i = 0; i < repeats; i += 1) out.push(...ids);
      return out;
    };
    const groupedToken = (prefix: number, ids: number[]): string =>
      `{${prefix}:[${ids.join(" ")}]}`;

    // Exemplar-inspired stacks from known-working modded codes:
    // - damage visual block: {9:[28 32 40 55 59 62 68 ...]}
    // - ammo reserve block: {22:[72 72 ...]}
    // - fire-rate-like push: {292:[9 9 ...]}
    const exemplarDamageGroup = groupedToken(
      9,
      repeatPattern(
        [28, 32, 40, 55, 59, 62, 68],
        randInt(modeCfg.exemplarCycleRepeats[0], modeCfg.exemplarCycleRepeats[1]),
      ),
    );
    const exemplarAmmoGroup = groupedToken(
      22,
      Array.from({ length: randInt(modeCfg.exemplarAmmoCount[0], modeCfg.exemplarAmmoCount[1]) }, () => 72),
    );
    const exemplarFireGroup = groupedToken(
      292,
      Array.from({ length: randInt(modeCfg.exemplarFireCount[0], modeCfg.exemplarFireCount[1]) }, () => 9),
    );
    const exemplarStabilityGroup =
      Math.random() < modeCfg.useStabilityGroupChance
        ? [groupedToken(14, Array.from({ length: randInt(8, 42) }, () => 3))]
        : [];

    const damageStacks = [
      exemplarDamageGroup,
      ...addStatStacks(
      (text) => /\bdamage\b|\bsplash\b|\bbonus damage\b|\bgun damage\b|\bmelee damage\b/.test(text),
      modeCfg.statRange[0],
      modeCfg.statRange[1],
      ),
    ];
    const ammoStacks = [
      exemplarAmmoGroup,
      ...addStatStacks(
      (text) => /\bmag\b|\bmagazine\b|\bammo\b|\bshots?\b/.test(text),
      modeCfg.statRange[0],
      modeCfg.statRange[1],
      ),
    ];
    const fireRateStacks = [
      exemplarFireGroup,
      ...exemplarStabilityGroup,
      ...addStatStacks(
      (text) => /\bfire rate\b|\/s fr\b|\bfr\b/.test(text),
      modeCfg.statRange[0],
      modeCfg.statRange[1],
      ),
    ];

    // Rule 3: heavy barrels can be used (cross-prefix grouped barrel parts).
    const mappedLegendaryBarrels = Array.from(legendaryBarrelIdsByPrefix.get(headerPrefix) ?? []).filter((id) =>
      validCurrentPartIds.has(id),
    );
    const samePrefixBarrels = mappedLegendaryBarrels.length
      ? mappedLegendaryBarrels
      : weaponRows
          .filter((r) => norm(r.partType) === "barrel" && isLegendary(r))
          .map((r) => Number(r.partId))
          .filter((n) => Number.isFinite(n) && validCurrentPartIds.has(n));
    const anyPrefixBarrels = weaponRows
      .filter((r) => norm(r.partType) === "barrel")
      .map((r) => Number(r.partId))
      .filter((n) => Number.isFinite(n) && validCurrentPartIds.has(n));
    const usableSamePrefixBarrels = samePrefixBarrels.length ? samePrefixBarrels : anyPrefixBarrels;
    if (!usableSamePrefixBarrels.length) {
      setMessage("Could not build stock weapon core: missing Barrel for selected prefix.");
      return;
    }
    const primaryBarrelToken = `{${pick(usableSamePrefixBarrels)}}`;
    const crossPrefixBarrels = Array.from(weaponRowsByPrefix.entries()).flatMap(([pfx, rows]) => {
      if (pfx === headerPrefix) return [];
      const idsInPrefix = new Set(
        rows.map((r) => Number(r.partId)).filter((n) => Number.isFinite(n)),
      );
      const mapped = Array.from(legendaryBarrelIdsByPrefix.get(pfx) ?? []).filter((id) => idsInPrefix.has(id));
      if (mapped.length) return mapped.map((part) => ({ prefix: pfx, part }));
      return rows
        .filter((r) => norm(r.partType) === "barrel" && isLegendary(r))
        .map((r) => ({ prefix: pfx, part: Number(r.partId) }))
        .filter((x) => Number.isFinite(x.part));
    });
    const samePrefixBarrelParts: string[] = [];
    for (let i = 0; i < randInt(modeCfg.extraBarrelsRange[0], modeCfg.extraBarrelsRange[1]); i += 1) {
      if (!usableSamePrefixBarrels.length) break;
      samePrefixBarrelParts.push(`{${pick(usableSamePrefixBarrels)}}`);
    }

    const crossByPrefix = new Map<number, number[]>();
    const crossPickCount = randInt(modeCfg.crossBarrelRange[0], modeCfg.crossBarrelRange[1]);
    for (let i = 0; i < crossPickCount; i += 1) {
      if (!crossPrefixBarrels.length) break;
      const c = pick(crossPrefixBarrels);
      if (!crossByPrefix.has(c.prefix)) crossByPrefix.set(c.prefix, []);
      crossByPrefix.get(c.prefix)!.push(c.part);
    }
    const crossParts = Array.from(crossByPrefix.entries()).map(
      ([prefix, parts]) => `{${prefix}:[${parts.join(" ")}]}`,
    );
    const barrelAccessoryStack = stackTokens(
      ["barrel accessory"],
      modeCfg.barrelAccRange[0],
      modeCfg.barrelAccRange[1],
    );
    if (toPartIds(["barrel accessory"]).length > 0 && barrelAccessoryStack.length < 4) {
      setMessage("Could not build stock weapon core: missing enough Barrel Accessory parts.");
      return;
    }

    const magazineToken = pickToken(["magazine"]);
    if (!magazineToken) {
      setMessage("Could not build stock weapon core: missing Magazine.");
      return;
    }
    const gripToken = pickToken(["grip"]);
    const foregripToken = pickToken(["foregrip"]);
    const scopeToken = pickToken(["scope"]);
    const manufacturerToken = pickToken(["manufacturer part"]);
    const underbarrelToken = pickToken(["underbarrel"]);
    const underbarrelAccessoryStack = stackTokens(
      ["underbarrel accessory"],
      modeCfg.underAccRange[0],
      modeCfg.underAccRange[1],
    );

    // Structured grenade sequence:
    // (1) legendary grenade code, (2) grenade perks group, (3) legendary grenade rarity.
    const grenadeParts: string[] = [];
    const grenadeLegendaryCode = candidates.filter(
      ({ row, parsed }) =>
        parsed.prefix === 291 && norm(row.rarity) === "legendary" && norm(row.partType) !== "rarity",
    );
    const grenadePerkPool = candidates.filter(
      ({ parsed, row }) => parsed.prefix === 245 && norm(row.partType) !== "rarity",
    );
    const grenadeLegendaryRarity = candidates.filter(
      ({ parsed, row }) =>
        [291, 289, 282, 273, 275, 281, 286].includes(parsed.prefix) &&
        norm(row.rarity) === "legendary" &&
        norm(row.partType) === "rarity",
    );
    const weaponManufacturer = norm(weaponRows[0]?.manufacturer ?? "");
    const shouldAddGrenadeReloadParts =
      weaponManufacturer.includes("tediore") ||
      candidates.some(
        ({ row, parsed }) =>
          parsed.prefix === headerPrefix && /\btediore\b|\breload\b/.test(norm(row.statText)),
      );
    if (shouldAddGrenadeReloadParts && grenadeLegendaryCode.length) {
      const g = pick(grenadeLegendaryCode);
      grenadeParts.push(`{${g.parsed.prefix}:${g.parsed.part}}`);
    }
    if (shouldAddGrenadeReloadParts && grenadePerkPool.length) {
      const n = randInt(modeCfg.grenadePerkRange[0], modeCfg.grenadePerkRange[1]);
      const perkIds: number[] = [];
      for (let i = 0; i < n; i += 1) perkIds.push(pick(grenadePerkPool).parsed.part);
      grenadeParts.push(`{245:[${perkIds.join(" ")}]}`);
    }
    if (shouldAddGrenadeReloadParts && grenadeLegendaryRarity.length) {
      const gr = pick(grenadeLegendaryRarity);
      grenadeParts.push(`{${gr.parsed.prefix}:${gr.parsed.part}}`);
    }

    const stalkerCandidates = candidates.filter(
      ({ row, parsed }) =>
        parsed.prefix === headerPrefix &&
        validCurrentPartIds.has(parsed.part) &&
        /\bstalker\b|\browan'?s charge\b/.test(norm(row.statText)),
    );
    const stalkerStacks: string[] = [];
    if (stalkerCandidates.length) {
      const stalkerPart = pick(stalkerCandidates).parsed.part;
      for (let i = 0; i < 7; i += 1) stalkerStacks.push(`{${stalkerPart}}`);
    }

    // Do not stack extra rarity tokens. We only enforce one legendary rarity
    // token for the weapon so result stays legendary without unnecessary rarity spam.
    const allNewParts = [
      firstRarityCode,
      ...(elementToken ? [elementToken] : []),
      bodyToken,
      ...bodyAccessoryStack,
      primaryBarrelToken,
      ...samePrefixBarrelParts,
      ...crossParts,
      ...barrelAccessoryStack,
      magazineToken,
      ...(gripToken ? [gripToken] : []),
      ...(foregripToken ? [foregripToken] : []),
      ...(scopeToken ? [scopeToken] : []),
      ...(manufacturerToken ? [manufacturerToken] : []),
      ...damageStacks,
      ...ammoStacks,
      ...fireRateStacks,
      ...(underbarrelToken ? [underbarrelToken] : []),
      ...underbarrelAccessoryStack,
      ...grenadeParts,
      ...stalkerStacks,
    ];
    if (!allNewParts.length) {
      setMessage("Could not build random modded parts.");
      return;
    }
    const finalParts = parseComponentString(allNewParts.join(" ")).filter((c) => typeof c !== "string");
    const newComponentStr = finalParts
      .map((p) => (typeof p === "string" ? p : p.raw))
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
    const chosenSkin = skinComboValue?.trim() || (skinOptions.length ? pick(skinOptions).value.trim() : "");
    const safeSkin = chosenSkin.replace(/"/g, '\\"');
    const updatedDecoded = safeSkin
      ? `${headerPrefix}, 0, 1, ${level}| 2, ${seed}|| ${newComponentStr} | "c", "${safeSkin}" |`
      : `${headerPrefix}, 0, 1, ${level}| 2, ${seed}|| ${newComponentStr} |`;
    setDecodedInput(updatedDecoded);
    setParsedComponents(finalParts);
    setCurrentMfgWtId(headerPrefix);
    setSelectedWeaponPath(null);
    setLoading("encode");
    try {
      const res = await fetchApi("save/encode-serial", {
        method: "POST",
        body: JSON.stringify({ decoded_string: updatedDecoded }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEncodedSerial("");
        setSerialInput("");
        setMessage(
          isLikelyUnavailable(res)
            ? getApiUnavailableError()
            : (data?.error ?? "Generated weapon, but auto-encode failed. Click Encode → Base85."),
        );
        return;
      }
      if (data?.success && typeof data?.serial === "string") {
        setEncodedSerial(data.serial);
        setSerialInput(data.serial);
        setMessage(
          safeSkin
            ? "Generated new modded weapon (with auto skin) and auto-encoded to Base85. Ready to Add to Backpack."
            : "Generated new modded weapon and auto-encoded to Base85. No skin was available to apply.",
        );
      } else {
        setEncodedSerial("");
        setSerialInput("");
        setMessage("Generated weapon, but auto-encode failed. Click Encode → Base85.");
      }
    } catch {
      setEncodedSerial("");
      setSerialInput("");
      setMessage("Generated weapon, but auto-encode failed. Service unavailable.");
    } finally {
      setLoading(null);
    }
  }, [weaponEditData, universalPartCodes, parseCodePair, newWeaponLevel, modPowerMode, skinComboValue, skinOptions]);

  const rebuildDecodedFromComponents = useCallback(
    (components: ParsedComponent[]): string => {
      const [header] = decodedInput.split("||", 1);
      const headerPart = (header ?? "").trim();
      const newComponentStr = components
        .map((p) => (typeof p === "string" ? p : p.raw))
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim();
      return headerPart ? `${headerPart}|| ${newComponentStr}` : decodedInput;
    },
    [decodedInput],
  );

  const handleMovePart = useCallback(
    (index: number, direction: -1 | 1) => {
      if (index < 0 || index >= parsedComponents.length) return;
      const target = index + direction;
      if (target < 0 || target >= parsedComponents.length) return;
      const next = [...parsedComponents];
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      const updatedDecoded = rebuildDecodedFromComponents(next);
      setParsedComponents(next);
      setDecodedInput(updatedDecoded);
    },
    [parsedComponents, rebuildDecodedFromComponents],
  );

  const handleDeletePart = useCallback(
    (index: number) => {
      if (index < 0 || index >= parsedComponents.length) return;
      const next = [...parsedComponents];
      next.splice(index, 1);
      const updatedDecoded = rebuildDecodedFromComponents(next);
      setParsedComponents(next);
      setDecodedInput(updatedDecoded);
    },
    [parsedComponents, rebuildDecodedFromComponents],
  );

  const randomModReadyReason = useMemo(() => {
    if (!weaponEditData) return "Weapon parts data is still loading.";
    if (!universalPartCodes.length) return "Universal parts DB data is still loading.";
    return "";
  }, [weaponEditData, universalPartCodes.length]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--color-text-muted)]">
        Load a weapon from your backpack, or paste Base85/decoded strings. Edit and update in place or add a copy to backpack.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowCleanCode(true)}
          className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] min-h-[44px] text-sm"
          title="Combine like codes in the decoded serial (e.g. {22:33} {22:16} → {22:[33 16]})"
        >
          Clean Code
        </button>
      </div>

      {/* Load from backpack */}
      <div className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
        <h3 className="text-[var(--color-accent)] font-medium mb-2">Load from backpack</h3>
        {!saveData ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            <Link to="/character/select-save" className="text-[var(--color-accent)] hover:underline">Load a save</Link> to list weapons.
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={loadBackpackWeapons}
              disabled={loading === "backpack"}
              className="mb-3 px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] disabled:opacity-50 min-h-[44px]"
            >
              {loading === "backpack" ? "Refreshing…" : "Refresh list"}
            </button>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {backpackWeapons.length === 0 && loading !== "backpack" && (
                <p className="text-sm text-[var(--color-text-muted)]">No weapons in backpack.</p>
              )}
              {backpackWeapons.map((w) => (
                <button
                  key={w.serial + w.slot.path.join("/")}
                  type="button"
                  onClick={() => handleLoadWeapon(w)}
                  className="block w-full text-left px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm text-[var(--color-text)] hover:border-[var(--color-accent)]"
                >
                  {w.manufacturer ?? "?"} {w.itemType ?? "Weapon"} — Lv.{w.level ?? "?"} — {w.slot.slotKey}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
          <h3 className="text-[var(--color-accent)] font-medium mb-2">Base85 / Serial</h3>
          <textarea
            value={serialInput}
            onChange={(e) => {
              setSerialInput(e.target.value);
              setSelectedWeaponPath(null);
            }}
            placeholder="Paste @U... serial here"
            rows={4}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono focus:outline-none focus:border-[var(--color-accent)] resize-y"
          />
          <button
            type="button"
            onClick={handleDecode}
            disabled={loading !== null}
            className="mt-2 px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] disabled:opacity-50 min-h-[44px]"
          >
            {loading === "decode" ? "Decoding…" : "Decode → Deserialized"}
          </button>
        </div>

        <div className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
          <h3 className="text-[var(--color-accent)] font-medium mb-2">Deserialized (decoded) string</h3>
          <textarea
            value={decodedInput}
            onChange={(e) => setDecodedInput(e.target.value)}
            placeholder="Paste decoded string (e.g. 255, 0, 1, 50| ... || part1, part2)"
            rows={4}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono focus:outline-none focus:border-[var(--color-accent)] resize-y"
          />
          <button
            type="button"
            onClick={handleEncode}
            disabled={loading !== null}
            className="mt-2 px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] disabled:opacity-50 min-h-[44px]"
          >
            {loading === "encode" ? "Encoding…" : "Encode → Base85"}
          </button>
        </div>
      </div>

      {/* Weapon parts list */}
      {parsedComponents.length > 0 && weaponEditData && currentMfgWtId != null && (
        <div className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[var(--color-accent)] font-medium">Weapon Parts</h3>
            <button
              type="button"
              onClick={handleOpenAddPart}
              className="px-3 py-1 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] text-sm min-h-[32px]"
            >
              + Add Part
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto text-sm">
            {parsedComponents
              .map((p, idx) => ({ p, idx }))
              .filter(({ p }) => typeof p !== "string")
              .map(({ p, idx }) => {
                if (typeof p === "string") return null;
                let idLabel = "";
                let typeLabel = "";
                let textLabel = "";
                let statLabel = "";
                if (p.type === "skin") {
                  idLabel = String(p.id);
                  typeLabel = "Skin";
                } else if (p.type === "elemental") {
                  idLabel = `${p.id}:${p.subId}`;
                  typeLabel = "Elemental";
                  const found = weaponEditData.elemental.find((e) => Number(e.partId) === p.subId);
                  const elemCode = `{1:${p.subId}}`;
                  const elemFallback = universalFallback[elemCode];
                  if (found) textLabel = found.stat;
                  else if (elemFallback) {
                    textLabel = elemFallback.string;
                    statLabel = elemFallback.stat;
                  }
                } else if (p.type === "simple" || p.type === "part") {
                  const mfgId = p.type === "part" ? p.mfgId : currentMfgWtId;
                  const row = weaponEditData.parts.find(
                    (r) => Number(r.mfgWtId) === mfgId && Number(r.partId) === p.id,
                  );
                  idLabel = String(p.id);
                  const partCode = mfgId != null ? `{${mfgId}:${p.id}}` : "";
                  const partFallback = partCode ? universalFallback[partCode] : undefined;
                  typeLabel = row?.partType ?? partFallback?.partType ?? "";
                  textLabel = row?.string ?? partFallback?.string ?? "";
                  statLabel = row?.stat ?? partFallback?.stat ?? "";
                } else if (p.type === "group") {
                  idLabel = String(p.id);
                  typeLabel = "Group";
                  textLabel = p.subIds.join(", ");
                }
                return (
                  <div
                    key={`${idx}-${idLabel}-${typeLabel}`}
                    className="grid grid-cols-[auto,auto,1fr,auto,auto] gap-2 items-center py-1 border-b border-[rgba(255,255,255,0.03)]"
                  >
                    <span className="inline-flex items-center justify-center min-w-[1.25rem] px-1.5 py-0.5 rounded text-xs font-mono border border-[var(--color-panel-border)] bg-[var(--color-accent-dim)] text-[var(--color-accent)] shrink-0">
                      {idLabel}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">{typeLabel}</span>
                    <span className="truncate">{textLabel}</span>
                    <span className="text-xs text-[var(--color-text-muted)] ml-2">
                      {statLabel}
                    </span>
                    <span className="flex gap-1 justify-end">
                      <button
                        type="button"
                        onClick={() => handleMovePart(idx, -1)}
                        className="px-1.5 py-0.5 rounded bg-[rgba(40,40,40,0.9)] text-[var(--color-text)] text-xs border border-[var(--color-panel-border)]"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMovePart(idx, 1)}
                        className="px-1.5 py-0.5 rounded bg-[rgba(40,40,40,0.9)] text-[var(--color-text)] text-xs border border-[var(--color-panel-border)]"
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePart(idx)}
                        className="px-1.5 py-0.5 rounded bg-[firebrick] text-white text-xs border border-[firebrick]"
                        title="Delete part"
                      >
                        ×
                      </button>
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Skin */}
      {skinOptions.length > 0 && (
        <div className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
          <h3 className="text-[var(--color-accent)] font-medium mb-2">Skin</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={skinComboValue}
              onChange={(e) => setSkinComboValue(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] min-h-[44px]"
              style={{ maxWidth: "20rem" }}
            >
              <option value="">None</option>
              {skinOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSkinAddToGun}
              className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] min-h-[44px]"
            >
              Add to Gun
            </button>
          </div>
          {skinComboValue && (
            <div className="mt-3">
              <SkinPreview
                token={skinComboValue}
                label={skinOptions.find((s) => s.value === skinComboValue)?.label ?? skinComboValue}
              />
            </div>
          )}
        </div>
      )}

      {/* Actions: Update Weapon, Add to Backpack, Flag */}
      <div className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
        <h3 className="text-[var(--color-accent)] font-medium mb-2">Actions</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-[var(--color-text-muted)]">New Weapon Level:</label>
          <input
            type="number"
            min={1}
            max={255}
            value={newWeaponLevel}
            onChange={(e) => setNewWeaponLevel(e.target.value)}
            className="w-24 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] min-h-[44px]"
            title="Header level value used by Generate New Modded Weapon"
          />
          <label className="text-sm text-[var(--color-text-muted)]">Power Mode:</label>
          <select
            value={modPowerMode}
            onChange={(e) => setModPowerMode(e.target.value as "stable" | "op" | "insane")}
            className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] min-h-[44px]"
            title="Stable = safest spawn, OP = default, Insane = max stack chaos"
          >
            <option value="stable">Stable</option>
            <option value="op">OP</option>
            <option value="insane">Insane</option>
          </select>
          <label className="text-sm text-[var(--color-text-muted)]">Flag:</label>
          <select
            value={flagValue}
            onChange={(e) => setFlagValue(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] min-h-[44px]"
          >
            {FLAG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleUpdateWeapon}
            disabled={loading !== null || !selectedWeaponPath?.length}
            className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] disabled:opacity-50 min-h-[44px]"
            title={selectedWeaponPath ? "Save changes to the weapon loaded from backpack" : "Load a weapon from backpack first"}
          >
            {loading === "update" ? "Updating…" : "Update Weapon"}
          </button>
          <button
            type="button"
            onClick={handleAddToBackpack}
            disabled={loading !== null || !saveData}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium hover:opacity-90 disabled:opacity-50 min-h-[44px]"
          >
            {loading === "add" ? "Adding…" : "Add to Backpack"}
          </button>
          <button
            type="button"
            onClick={handleRandomModdedWeapon}
            disabled={loading !== null}
            className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] disabled:opacity-50 min-h-[44px]"
            title={randomModReadyReason || "Generate a brand-new modded weapon with a fresh header and legendary-first part stack"}
          >
            Generate New Modded Weapon
          </button>
          {!saveData && (
            <Link to="/character/select-save" className="text-sm text-[var(--color-accent)] hover:underline">
              Load a save first
            </Link>
          )}
        </div>
        {encodedSerial && (
          <div className="mt-3">
            <p className="text-xs text-[var(--color-text-muted)] mb-1">Encoded serial</p>
            <textarea
              readOnly
              value={encodedSerial}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-xs font-mono"
            />
          </div>
        )}
      </div>

      {/* Add Part dialog (simple inline modal) */}
      {showAddPart && weaponEditData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40">
          <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl flex flex-col">
            <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between">
              <h3 className="text-[var(--color-accent)] font-medium text-sm">Add Parts</h3>
              <button
                type="button"
                onClick={() => setShowAddPart(false)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] text-sm"
              >
                Close
              </button>
            </div>
            <div className="flex-1 px-4 py-3 text-sm flex gap-4 overflow-hidden">
              {/* Left: weapon type + manufacturer filters */}
              <div className="w-56 flex-shrink-0 flex flex-col gap-3 overflow-y-auto pr-2 border-r border-[var(--color-panel-border)]">
                <div>
                  <div className="text-xs text-[var(--color-text-muted)] mb-1">Weapon Type</div>
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWeaponTypeFilter("Elemental");
                        setSelectedManufacturerFilter(null);
                      }}
                      className={`w-full text-left px-2 py-1 rounded text-xs ${
                        selectedWeaponTypeFilter === "Elemental"
                          ? "bg-[var(--color-accent)] text-black"
                          : "bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)]"
                      }`}
                    >
                      Elemental
                    </button>
                    {Array.from(
                      new Set(
                        weaponEditData.parts.map((p) => p.weaponType).filter((w) => w),
                      ),
                    ).map((wt) => (
                      <button
                        key={wt}
                        type="button"
                        onClick={() => {
                          setSelectedWeaponTypeFilter(wt);
                          setSelectedManufacturerFilter(null);
                        }}
                        className={`w-full text-left px-2 py-1 rounded text-xs ${
                          selectedWeaponTypeFilter === wt
                            ? "bg-[var(--color-accent)] text-black"
                            : "bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)]"
                        }`}
                      >
                        {wt}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedWeaponTypeFilter && selectedWeaponTypeFilter !== "Elemental" && (
                  <div>
                    <div className="text-xs text-[var(--color-text-muted)] mb-1">
                      Manufacturer
                    </div>
                    <div className="space-y-1">
                      {Array.from(
                        new Set(
                          weaponEditData.parts
                            .filter((p) => p.weaponType === selectedWeaponTypeFilter)
                            .map((p) => p.manufacturer)
                            .filter((m) => m),
                        ),
                      ).map((mfg) => (
                        <button
                          key={mfg}
                          type="button"
                          onClick={() => setSelectedManufacturerFilter(mfg)}
                          className={`w-full text-left px-2 py-1 rounded text-xs ${
                            selectedManufacturerFilter === mfg
                              ? "bg-[var(--color-accent)] text-black"
                              : "bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)]"
                          }`}
                        >
                          {mfg}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: parts list for current filters */}
              <div className="flex-1 overflow-y-auto space-y-1 pl-1">
                {addPartSelections
                  .map((s, idx) => ({ s, idx }))
                  .filter(({ s }) => {
                    if (!selectedWeaponTypeFilter) return true;
                    if (selectedWeaponTypeFilter === "Elemental") {
                      return s.type === "elemental";
                    }
                    if (s.type !== "normal") return false;
                    if (s.weaponType !== selectedWeaponTypeFilter) return false;
                    if (selectedManufacturerFilter && s.manufacturer !== selectedManufacturerFilter)
                      return false;
                    return true;
                  })
                  .map(({ s, idx }) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={s.checked}
                        onChange={() => handleToggleSelection(idx)}
                      />
                      <span className="flex-1">{s.label}</span>
                      {s.checked && (
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={s.qty}
                          onChange={(e) => handleQtyChange(idx, e.target.value)}
                          className="w-16 px-1 py-0.5 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-xs"
                        />
                      )}
                    </div>
                  ))}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-[var(--color-panel-border)] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddPart(false)}
                className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] min-h-[40px] text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAddParts}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium hover:opacity-90 min-h-[40px] text-sm"
              >
                Confirm Add
              </button>
            </div>
          </div>
        </div>
      )}

      {showCleanCode && (
        <CleanCodeDialog
          initialDecoded={decodedInput}
          initialBase85={serialInput}
          onClose={() => setShowCleanCode(false)}
        />
      )}

      {message && (
        <p className="text-sm text-[var(--color-accent)]">{message}</p>
      )}
    </div>
  );
}
