import { useState, useCallback, useEffect } from "react";
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
    const serial = encodedSerial.trim() || serialInput.trim();
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
        setMessage("Item added to backpack. Use Download .sav on Select Save to export.");
      } else {
        setMessage(data?.error ?? "Add failed");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [encodedSerial, serialInput, saveData, flagValue, getYamlText, updateSaveData]);

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
    const updated = decoded.replace(/\|\s*$/, ` "c", "${safe}" |`);
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
