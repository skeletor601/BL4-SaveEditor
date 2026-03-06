import { useState, useCallback, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { parse as yamlParse } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import { getBackpackSlotsWithPaths, type ItemSlotWithPath } from "@/lib/inventoryData";
import { fetchApi, getApiUnavailableError, isLikelyUnavailable } from "@/lib/apiClient";
import CleanCodeDialog from "@/components/weapon-toolbox/CleanCodeDialog";
import SkinPreview from "@/components/weapon-toolbox/SkinPreview";

const FLAG_OPTIONS = [
  { value: 1, label: "1 (Normal)" },
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 17, label: "17" },
  { value: 33, label: "33" },
  { value: 65, label: "65" },
  { value: 129, label: "129" },
];

type ItemTypeKey = "grenade" | "shield" | "repkit" | "heavy";

const ITEM_TYPE_FROM_NAME: Record<string, ItemTypeKey> = {
  Grenade: "grenade",
  Shield: "shield",
  Repkit: "repkit",
  "Heavy Weapon": "heavy",
};

interface DecodedBackpackItem {
  slot: ItemSlotWithPath;
  serial: string;
  decodedFull: string;
  itemType?: string;
  name?: string;
  level?: number;
}

interface ItemEditPartRow {
  typeKey: ItemTypeKey;
  typeId: string;
  partId: string;
  partType: string;
  string: string;
  stat: string;
}

interface ItemEditData {
  parts: ItemEditPartRow[];
}

type ItemAddPartSelection = { row: ItemEditPartRow; checked: boolean; qty: string };

/** Shorten long effect/stat strings to the most important 4 words, keeping numbers. */
function abbreviateToImportantWords(text: string, maxWords = 4): string {
  if (!text) return text;
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length <= maxWords) return text;
  const withNumbers: string[] = [];
  const rest: string[] = [];
  for (const t of tokens) {
    if (/\d/.test(t)) withNumbers.push(t);
    else rest.push(t);
  }
  const important = [...withNumbers, ...rest].slice(0, maxWords);
  return important.join(" ");
}

type ParsedComponent =
  | string
  | { type: "group"; typeId: number; subIds: number[]; raw: string }
  | { type: "part"; typeId: number; partId: number; raw: string }
  | { type: "simple"; typeId: number; partId: number; raw: string };

function parseComponentString(componentStr: string): ParsedComponent[] {
  const result: ParsedComponent[] = [];
  const regex = /\{(\d+)(?::(\d+|\[[\d\s]+\]))?\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(componentStr)) !== null) {
    const raw = match[0];
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
        result.push({ type: "group", typeId: outerId, subIds, raw });
      } else {
        result.push({ type: "part", typeId: outerId, partId: Number(inner), raw });
      }
    } else {
      result.push({ type: "simple", typeId: outerId, partId: outerId, raw });
    }
  }
  return result;
}

function buildPartStringsFromSelections(
  selections: ItemEditPartRow[],
  headerTypeId: number | null,
): string[] {
  if (headerTypeId == null) return [];
  const byKey = new Map<string, number[]>();
  for (const row of selections) {
    const typeIdNum = Number(row.typeId);
    const partIdNum = Number(row.partId);
    if (!Number.isFinite(typeIdNum) || !Number.isFinite(partIdNum)) continue;
    const key = `${typeIdNum}:${partIdNum}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(partIdNum);
  }
  const tokens: string[] = [];
  for (const [key, partIds] of byKey) {
    const [typeIdStr] = key.split(":");
    const typeIdNum = Number(typeIdStr);
    if (partIds.length === 1) {
      if (typeIdNum === headerTypeId) {
        tokens.push(`{${partIds[0]}}`);
      } else {
        tokens.push(`{${typeIdNum}:${partIds[0]}}`);
      }
    } else {
      const list = partIds.join(" ");
      tokens.push(`{${typeIdNum}:[${list}]}`);
    }
  }
  return tokens;
}

export default function ItemEditView() {
  const location = useLocation();
  const { saveData, getYamlText, updateSaveData } = useSave();
  const [serialInput, setSerialInput] = useState("");
  const [decodedInput, setDecodedInput] = useState("");
  const [encodedSerial, setEncodedSerial] = useState("");
  const [flagValue, setFlagValue] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<"decode" | "encode" | "add" | "backpack" | "update" | null>(
    null,
  );

  const [backpackItems, setBackpackItems] = useState<DecodedBackpackItem[]>([]);
  const [selectedItemPath, setSelectedItemPath] = useState<string[] | null>(null);

  useEffect(() => {
    const loadItem = (location.state as { loadItem?: { serial?: string; decodedFull?: string; path?: string[] } } | null)?.loadItem;
    if (loadItem && typeof loadItem === "object") {
      if (typeof loadItem.serial === "string" && loadItem.serial.trim()) {
        setSerialInput(loadItem.serial.trim());
      }
      if (typeof loadItem.decodedFull === "string" && loadItem.decodedFull.trim()) {
        setDecodedInput(loadItem.decodedFull.trim());
      }
      if (Array.isArray(loadItem.path) && loadItem.path.length > 0) {
        setSelectedItemPath(loadItem.path);
      }
      setEncodedSerial("");
      setMessage("Item loaded from backpack. Edit and click Update Item to save.");
    }
  }, [location.state]);
  const [itemEditData, setItemEditData] = useState<ItemEditData | null>(null);
  const [currentTypeKey, setCurrentTypeKey] = useState<ItemTypeKey | null>(null);
  const [parsedComponents, setParsedComponents] = useState<ParsedComponent[]>([]);
  const [showAddPart, setShowAddPart] = useState(false);
  const [addPartSelections, setAddPartSelections] = useState<ItemAddPartSelection[]>([]);
  /** Fallback from master search DB when item CSV has no row for a part (avoids empty rows). */
  const [universalFallback, setUniversalFallback] = useState<Record<string, { partType: string; string: string; stat: string }>>({});
  const [showCleanCode, setShowCleanCode] = useState(false);
  const [skinOptions, setSkinOptions] = useState<{ label: string; value: string }[]>([]);
  const [skinComboValue, setSkinComboValue] = useState("");

  useEffect(() => {
    fetchApi("item-edit/data")
      .then((r) => r.json())
      .then((d: ItemEditData) => setItemEditData(d))
      .catch(() => setItemEditData(null));
  }, []);

  /** Fetch master-search fallback for parts not in item CSVs so we never show empty rows. */
  useEffect(() => {
    if (!itemEditData || !currentTypeKey || parsedComponents.length === 0) {
      setUniversalFallback({});
      return;
    }
    const codes: string[] = [];
    for (const p of parsedComponents) {
      if (typeof p === "string") continue;
      const typeId = p.typeId;
      const partId = p.type === "group" ? (p.subIds[0] ?? NaN) : p.partId;
      const code = `{${typeId}:${partId}}`;
      const hasInCsv = itemEditData.parts.some(
        (r) =>
          r.typeKey === currentTypeKey &&
          Number(r.typeId) === typeId &&
          Number(r.partId) === partId,
      );
      if (!hasInCsv && !codes.includes(code)) codes.push(code);
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
  }, [itemEditData, currentTypeKey, parsedComponents]);

  useEffect(() => {
    fetchApi("weapon-gen/data")
      .then((r) => r.json())
      .then((d: { skins?: { label: string; value: string }[] }) => setSkinOptions(d?.skins ?? []))
      .catch(() => setSkinOptions([]));
  }, []);

  const handleSkinAddToItem = useCallback(() => {
    const skinValue = skinComboValue?.trim();
    if (!skinValue) {
      setMessage("Select a skin first.");
      return;
    }
    const decoded = decodedInput.trim();
    if (!decoded) {
      setMessage("Paste or decode an item first.");
      return;
    }
    const safe = skinValue.replace(/"/g, '\\"');
    const updated = decoded.replace(/\|\s*$/, ` "c", "${safe}" |`);
    setDecodedInput(updated);
    setMessage("Skin appended to decoded string. Click Encode or Update Item to apply.");
  }, [skinComboValue, decodedInput]);

  // Keep parsed components in sync with decodedInput.
  useEffect(() => {
    const decoded = decodedInput.trim();
    if (!decoded || !decoded.includes("||")) {
      setParsedComponents([]);
      return;
    }
    const [header, component] = decoded.split("||", 2);
    const headerFirst = header.trim().split("|")[0]?.split(",")[0];
    const headerTypeId = Number(headerFirst);
    const base = parseComponentString(component);
    const flattened: ParsedComponent[] = [];
    base.forEach((c) => {
      if (typeof c === "string") return;
      if (c.type === "group") {
        c.subIds.forEach((sid) => {
          flattened.push({
            type: "part",
            typeId: c.typeId,
            partId: sid,
            raw: `{${c.typeId}:${sid}}`,
          });
        });
      } else if (c.type === "part") {
        flattened.push(c);
      } else if (c.type === "simple") {
        const tId = Number.isFinite(headerTypeId) ? headerTypeId : c.typeId;
        flattened.push({ type: "part", typeId: tId, partId: c.partId, raw: c.raw });
      }
    });
    setParsedComponents(flattened);
  }, [decodedInput]);

  const loadBackpackItems = useCallback(async () => {
    if (!saveData) {
      setBackpackItems([]);
      setMessage("Load a save first (Character → Select Save) to list items.");
      return;
    }
    const slots = getBackpackSlotsWithPaths(saveData);
    const serials = slots.map((s) => s.serial).filter((s) => s?.trim().startsWith("@U"));
    if (serials.length === 0) {
      setBackpackItems([]);
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
        setMessage(isLikelyUnavailable(res) ? getApiUnavailableError() : data?.error ?? "Decode failed");
        setBackpackItems([]);
        return;
      }
      const items = data?.items ?? [];
      const slotBySerial = new Map(slots.map((s) => [s.serial, s]));
      const filtered: DecodedBackpackItem[] = [];
      items.forEach(
        (item: { serial?: string; error?: string; decodedFull?: string; itemType?: string; level?: number; name?: string }, i: number) => {
          if (item.error || !item.serial) return;
          const typeKey = ITEM_TYPE_FROM_NAME[item.itemType ?? ""] as ItemTypeKey | undefined;
          if (!typeKey) return;
          const slot = slotBySerial.get(item.serial) ?? slots[i];
          if (!slot || !("path" in slot)) return;
          filtered.push({
            slot: slot as ItemSlotWithPath,
            serial: item.serial,
            decodedFull: item.decodedFull ?? "",
            itemType: item.itemType,
            level: item.level,
            name: item.name,
          });
        },
      );
      setBackpackItems(filtered);
      setMessage(filtered.length === 0 ? "No grenades, shields, repkits, or heavies in backpack." : null);
    } catch {
      setMessage(getApiUnavailableError());
      setBackpackItems([]);
    } finally {
      setLoading(null);
    }
  }, [saveData]);

  useEffect(() => {
    if (!saveData) {
      setBackpackItems([]);
      return;
    }
    loadBackpackItems();
  }, [saveData, loadBackpackItems]);

  const handleLoadItem = useCallback((item: DecodedBackpackItem) => {
    setSerialInput(item.serial);
    setDecodedInput(item.decodedFull);
    setEncodedSerial("");
    setSelectedItemPath(item.slot.path);
    const typeKey = ITEM_TYPE_FROM_NAME[item.itemType ?? ""] as ItemTypeKey | undefined;
    setCurrentTypeKey(typeKey ?? null);
    setMessage(
      "Item loaded. Edit and click Update Item to save in place, or Encode then Add to Backpack for a copy.",
    );
  }, []);

  const handleDecode = useCallback(async () => {
    const raw = serialInput.trim();
    if (!raw || !raw.startsWith("@U")) {
      setMessage("Paste a Base85 serial (must start with @U).");
      return;
    }
    setLoading("decode");
    setMessage(null);
    setSelectedItemPath(null);
    try {
      const res = await fetchApi("save/decode-items", {
        method: "POST",
        body: JSON.stringify({ serials: [raw] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(isLikelyUnavailable(res) ? getApiUnavailableError() : data?.error ?? "Decode failed");
        return;
      }
      const first = (data?.items ?? [])[0];
      if (first?.error) {
        setMessage(first.error);
        return;
      }
      if (typeof first?.decodedFull === "string") {
        setDecodedInput(first.decodedFull);
        setEncodedSerial("");
        const typeKey = ITEM_TYPE_FROM_NAME[first.itemType ?? ""] as ItemTypeKey | undefined;
        setCurrentTypeKey(typeKey ?? null);
        setMessage("Decoded. Edit and Encode to Base85, or Update Item if loaded from backpack.");
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
      setMessage("Enter or paste a deserialized string.");
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
        setMessage(isLikelyUnavailable(res) ? getApiUnavailableError() : data?.error ?? "Encode failed");
        return;
      }
      if (data?.success && typeof data?.serial === "string") {
        setEncodedSerial(data.serial);
        setSerialInput(data.serial);
        setMessage("Encoded. Add to backpack below.");
      } else {
        setMessage(data?.error ?? "Encode failed");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [decodedInput]);

  const handleUpdateItem = useCallback(async () => {
    if (!selectedItemPath || selectedItemPath.length === 0) {
      setMessage("Load an item from backpack first, then edit and click Update Item.");
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
          item_path: selectedItemPath,
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
        setMessage("Item updated in backpack. Use Download .sav on Select Save to export.");
      } else {
        setMessage(updateJson?.error ?? "Update failed");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [selectedItemPath, decodedInput, saveData, getYamlText, updateSaveData]);

  const handleAddToBackpack = useCallback(async () => {
    const serial = (encodedSerial.trim() || serialInput.trim()).trim();
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
        setMessage(isLikelyUnavailable(res) ? getApiUnavailableError() : data?.error ?? "Add failed");
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

  const handleOpenAddPart = useCallback(() => {
    if (!decodedInput.trim() || !itemEditData || !currentTypeKey) {
      setMessage("Load and decode a grenade, shield, repkit, or heavy first.");
      return;
    }
    const parts = itemEditData.parts.filter((p) => p.typeKey === currentTypeKey);
    setAddPartSelections(
      parts.map((row) => ({ row, checked: false, qty: "1" })),
    );
    setShowAddPart(true);
  }, [decodedInput, itemEditData, currentTypeKey]);

  const handleToggleAddPartSelection = useCallback((index: number) => {
    setAddPartSelections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, checked: !s.checked } : s)),
    );
  }, []);

  const handleAddPartQtyChange = useCallback((index: number, value: string) => {
    setAddPartSelections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, qty: value } : s)),
    );
  }, []);

  const rebuildDecodedFromComponents = useCallback(
    (components: ParsedComponent[]): string => {
      const [header] = decodedInput.split("||", 1);
      const headerPart = (header ?? "").trim();
      const newComponentStr = components
        .map((p) => (typeof p === "string" ? p : p.raw))
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim();
      return headerPart ? `${headerPart}|| ${newComponentStr} |` : decodedInput;
    },
    [decodedInput],
  );

  /** Build grouped runs (start index in parsedComponents, count, part info) for layer UI. */
  const getGroupedRuns = useCallback(() => {
    const runs: { start: number; count: number; p: Exclude<ParsedComponent, string> }[] = [];
    let i = 0;
    while (i < parsedComponents.length) {
      const cur = parsedComponents[i];
      if (typeof cur === "string") {
        i += 1;
        continue;
      }
      let count = 1;
      let j = i + 1;
      while (j < parsedComponents.length) {
        const nxt = parsedComponents[j];
        if (
          typeof nxt !== "string" &&
          nxt.typeId === cur.typeId &&
          nxt.raw === cur.raw
        ) {
          count += 1;
          j += 1;
        } else break;
      }
      runs.push({ start: i, count, p: cur });
      i = j;
    }
    return runs;
  }, [parsedComponents]);

  const handleMoveItemLayer = useCallback(
    (groupIndex: number, direction: -1 | 1) => {
      const runs = getGroupedRuns();
      if (groupIndex < 0 || groupIndex >= runs.length) return;
      const targetIndex = groupIndex + direction;
      if (targetIndex < 0 || targetIndex >= runs.length) return;
      const parts = parsedComponents;
      const newParts: ParsedComponent[] = [];
      for (let i = 0; i < runs.length; i++) {
        if (i === groupIndex) {
          newParts.push(...parts.slice(runs[targetIndex].start, runs[targetIndex].start + runs[targetIndex].count));
        } else if (i === targetIndex) {
          newParts.push(...parts.slice(runs[groupIndex].start, runs[groupIndex].start + runs[groupIndex].count));
        } else {
          const r = runs[i];
          newParts.push(...parts.slice(r.start, r.start + r.count));
        }
      }
      const updated = rebuildDecodedFromComponents(newParts);
      setParsedComponents(newParts);
      setDecodedInput(updated);
    },
    [parsedComponents, getGroupedRuns, rebuildDecodedFromComponents],
  );

  const handleDeleteItemLayer = useCallback(
    (groupIndex: number) => {
      const runs = getGroupedRuns();
      if (groupIndex < 0 || groupIndex >= runs.length) return;
      const r = runs[groupIndex];
      const next = [...parsedComponents];
      next.splice(r.start, r.count);
      const updated = rebuildDecodedFromComponents(next);
      setParsedComponents(next);
      setDecodedInput(updated);
    },
    [parsedComponents, getGroupedRuns, rebuildDecodedFromComponents],
  );

  const handleConfirmAddParts = useCallback(() => {
    const selected = addPartSelections.filter((s) => s.checked);
    if (!selected.length) {
      setShowAddPart(false);
      return;
    }
    const rowsToAdd: ItemEditPartRow[] = [];
    for (const s of selected) {
      let count = 1;
      const q = s.qty.trim();
      if (q && /^\d+$/.test(q)) count = Math.max(1, Math.min(99, Number(q)));
      for (let i = 0; i < count; i++) rowsToAdd.push(s.row);
    }
    if (!decodedInput.trim()) {
      setShowAddPart(false);
      return;
    }
    const header = decodedInput.split("||", 1)[0] ?? "";
      const headerFirst = header.trim().split("|")[0]?.split(",")[0];
      const headerTypeId = Number(headerFirst);
      const newTokens = buildPartStringsFromSelections(rowsToAdd, Number.isFinite(headerTypeId) ? headerTypeId : null);
      if (!newTokens.length) {
        setShowAddPart(false);
        return;
      }
      const newComponents = parseComponentString(newTokens.join(" "));
      const partsData = [...parsedComponents];
      let insertionIndex = partsData.length;
      for (let i = partsData.length - 1; i >= 0; i -= 1) {
        const p = partsData[i];
        if (typeof p !== "string") {
          insertionIndex = i + 1;
          break;
        }
      }
      if (insertionIndex > 0) {
        const prev = partsData[insertionIndex - 1];
        if (typeof prev !== "string" || prev.trim()) {
          partsData.splice(insertionIndex, 0, " ");
          insertionIndex += 1;
        }
      }
      partsData.splice(insertionIndex, 0, ...newComponents);
      const headerPart = header.trim();
      const newComponentStr = partsData
        .map((p) => (typeof p === "string" ? p : p.raw))
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim();
      const updated = `${headerPart}|| ${newComponentStr} |`;
      setParsedComponents(partsData);
      setDecodedInput(updated);
      setShowAddPart(false);
      setMessage("Parts added. Click Encode or Update Item to apply.");
  }, [addPartSelections, decodedInput, parsedComponents]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--color-text-muted)]">
        Edit grenades, shields, repkits, and heavy weapons. Load from backpack or paste Base85/decoded
        strings. Then adjust parts and update in place or add a copy to backpack.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowCleanCode(true)}
          className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] min-h-[44px] text-sm"
          title="Combine like codes in the decoded serial (e.g. {245:1} {245:2} → {245:[1 2]})"
        >
          Clean Code
        </button>
      </div>

      {/* Load from backpack */}
      <div className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
        <h3 className="text-[var(--color-accent)] font-medium mb-2">Load from backpack</h3>
        {!saveData ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            <Link to="/character/select-save" className="text-[var(--color-accent)] hover:underline">
              Load a save
            </Link>{" "}
            to list items.
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={loadBackpackItems}
              disabled={loading === "backpack"}
              className="mb-3 px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] disabled:opacity-50 min-h-[44px]"
            >
              {loading === "backpack" ? "Refreshing…" : "Refresh list"}
            </button>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {backpackItems.length === 0 && loading !== "backpack" && (
                <p className="text-sm text-[var(--color-text-muted)]">
                  No grenades, shields, repkits, or heavies in backpack.
                </p>
              )}
              {backpackItems.map((it) => (
                <button
                  key={it.serial + it.slot.path.join("/")}
                  type="button"
                  onClick={() => handleLoadItem(it)}
                  className="block w-full text-left px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm text-[var(--color-text)] hover:border-[var(--color-accent)]"
                >
                  {it.itemType ?? "Item"} — Lv.{it.level ?? "?"} — {it.slot.slotKey}
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
            onChange={(e) => setSerialInput(e.target.value)}
            placeholder="Paste @U... serial"
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
            placeholder="Paste decoded string (e.g. 270, 0, 1, 50| ... || {245:1} {245:2})"
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

      {/* Skin - same as Weapon Edit: preview/paster, add to build */}
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
              onClick={handleSkinAddToItem}
              className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] min-h-[44px]"
            >
              Add to Item
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

      {/* Item parts list + Add Part (simplified, using app CSV data) */}
      {parsedComponents.length > 0 && itemEditData && currentTypeKey && (
        <div className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[var(--color-accent)] font-medium">Item Parts</h3>
            <button
              type="button"
              onClick={handleOpenAddPart}
              className="px-3 py-1 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] text-sm min-h-[32px]"
            >
              + Add Part
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto text-sm">
            {getGroupedRuns().map(({ p, count }, groupIndex) => {
              const typeId = p.typeId;
            const partId = p.type === "group" ? (p.subIds[0] ?? NaN) : p.partId;
              const info = itemEditData.parts.find(
                (r) =>
                  r.typeKey === currentTypeKey &&
                  Number(r.typeId) === typeId &&
                  Number(r.partId) === partId,
              );
              const code = `{${typeId}:${partId}}`;
              const fallback = universalFallback[code];
            const nameLabel = info?.partType ?? info?.stat ?? fallback?.partType ?? fallback?.stat ?? String(partId);
            const partStringRaw = info?.string ?? fallback?.string ?? "";
            const partStringLabel = abbreviateToImportantWords(partStringRaw);
              const qtySuffix = count > 1 ? ` x${count}` : "";
              return (
                <div
                  key={`${typeId}:${partId}-${groupIndex}`}
                  className="grid grid-cols-[1fr,1fr,auto] gap-2 items-center py-1 border-b border-[rgba(255,255,255,0.03)]"
                >
                  <span className="truncate text-[var(--color-text)] flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center min-w-[1.25rem] px-1.5 py-0.5 rounded text-xs font-mono border border-[var(--color-panel-border)] bg-[var(--color-accent-dim)] text-[var(--color-accent)] shrink-0">
                      {partId}
                    </span>
                    {nameLabel}{qtySuffix}
                  </span>
                  <span className="truncate text-[var(--color-text-muted)] text-xs">{partStringLabel}</span>
                  <span className="flex gap-1 justify-end">
                    <button
                      type="button"
                      onClick={() => handleMoveItemLayer(groupIndex, -1)}
                      className="px-1.5 py-0.5 rounded bg-[rgba(40,40,40,0.9)] text-[var(--color-text)] text-xs border border-[var(--color-panel-border)]"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveItemLayer(groupIndex, 1)}
                      className="px-1.5 py-0.5 rounded bg-[rgba(40,40,40,0.9)] text-[var(--color-text)] text-xs border border-[var(--color-panel-border)]"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItemLayer(groupIndex)}
                      className="px-1.5 py-0.5 rounded bg-[firebrick] text-white text-xs border border-[firebrick]"
                      title="Remove"
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

      {/* Actions: Update Item, Add to Backpack, Flag */}
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
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleUpdateItem}
            disabled={loading !== null || !selectedItemPath?.length}
            className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] disabled:opacity-50 min-h-[44px]"
          >
            {loading === "update" ? "Updating…" : "Update Item"}
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

      {message && <p className="text-sm text-[var(--color-accent)]">{message}</p>}

      {/* Add Part modal: checkbox list + qty, same pattern as Weapon Edit */}
      {showAddPart && itemEditData && currentTypeKey && (
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
            <div className="flex-1 overflow-y-auto px-4 py-3 text-sm space-y-1">
              {addPartSelections.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={s.checked}
                    onChange={() => handleToggleAddPartSelection(idx)}
                  />
                  <span className="flex-1 flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center min-w-[1.25rem] px-1.5 py-0.5 rounded text-xs font-mono border border-[var(--color-panel-border)] bg-[var(--color-accent-dim)] text-[var(--color-accent)] shrink-0">
                      {s.row.partId}
                    </span>
                    {s.row.partType} | {s.row.string}
                    {s.row.stat ? ` | ${s.row.stat}` : ""}
                  </span>
                  {s.checked && (
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={s.qty}
                      onChange={(e) => handleAddPartQtyChange(idx, e.target.value)}
                      className="w-16 px-1 py-0.5 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-xs"
                    />
                  )}
                </div>
              ))}
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
    </div>
  );
}
