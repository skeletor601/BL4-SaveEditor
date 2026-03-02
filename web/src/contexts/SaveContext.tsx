import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export type SaveData = Record<string, unknown>;

export interface SaveSummary {
  charName: string;
  level: string;
  difficulty: string;
  hasState: boolean;
}

function getSummary(data: SaveData | null): SaveSummary | null {
  if (!data || typeof data !== "object") return null;
  const state = (data.state as Record<string, unknown>) ?? data;
  if (typeof state !== "object") return null;
  const charName = String(state.char_name ?? state.charName ?? "").trim();
  const difficulty = String(state.player_difficulty ?? state.playerDifficulty ?? "").trim();
  let level = "";
  const expList = state.experience;
  if (Array.isArray(expList)) {
    const charExp = expList.find(
      (item: unknown) => typeof item === "object" && item !== null && (item as Record<string, unknown>).type === "Character"
    ) as Record<string, unknown> | undefined;
    if (charExp && typeof charExp.level !== "undefined") level = String(charExp.level);
  }
  return {
    charName: charName || "—",
    level: level || "—",
    difficulty: difficulty || "—",
    hasState: true,
  };
}

export type SavePlatform = "epic" | "steam" | null;

interface SaveContextValue {
  saveData: SaveData | null;
  saveFileName: string | null;
  loadError: string | null;
  summary: SaveSummary | null;
  /** Set when save was decrypted from .sav; needed to re-encrypt on download. */
  saveUserId: string | null;
  savePlatform: SavePlatform;
  loadFromFile: (file: File) => Promise<void>;
  loadFromText: (text: string, format: "json" | "yaml") => void;
  /** Decrypt .sav bytes with Epic/Steam User ID; updates saveData and platform. Optional 3rd arg = original .sav filename for roundtrip download. */
  decryptSav: (encBytes: Uint8Array, userId: string, originalSavFileName?: string | null) => void | Promise<void>;
  clearSave: () => void;
  exportAsJson: (filename?: string) => void;
  exportAsYaml: (filename?: string) => void;
  /** Re-encrypt current save to .sav and trigger download. Requires saveUserId/savePlatform from decrypt. */
  downloadAsSav: (filename?: string) => void | Promise<void>;
  /** No-edit roundtrip: re-encrypt raw decrypted bytes and download (no YAML parse/emit). Only when rawBytesBase64 is set. */
  downloadRebuiltSavNoEdit: (filename?: string) => void | Promise<void>;
  /** True when we have raw bytes from decrypt (no edits) for roundtrip. */
  hasRawBytesForRoundtrip: boolean;
  /** Replace save data (e.g. after editing character). Keeps saveUserId/savePlatform for re-encrypt. */
  updateSaveData: (data: SaveData) => void;
  /** Current YAML as string (raw from decrypt when no edits, else stringified). For YAML View. */
  getYamlText: () => string;
}

const SaveContext = createContext<SaveContextValue | null>(null);

export function SaveProvider({ children }: { children: React.ReactNode }) {
  const [saveData, setSaveData] = useState<SaveData | null>(null);
  const [saveFileName, setSaveFileName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveUserId, setSaveUserId] = useState<string | null>(null);
  const [savePlatform, setSavePlatform] = useState<SavePlatform>(null);
  /** Exact decrypted YAML string; use for encrypt when no edits so round-trip matches desktop. */
  const [rawYamlUtf8, setRawYamlUtf8] = useState<string | null>(null);
  /** Decrypted payload as base64 (no YAML touch); for no-edit roundtrip. Cleared on updateSaveData. */
  const [rawBytesBase64, setRawBytesBase64] = useState<string | null>(null);

  const summary = useMemo(() => getSummary(saveData), [saveData]);

  const loadFromText = useCallback((text: string, format: "json" | "yaml") => {
    setLoadError(null);
    try {
      let parsed: SaveData;
      if (format === "json") {
        parsed = JSON.parse(text) as SaveData;
      } else {
        parsed = yamlParse(text) as SaveData;
      }
      if (parsed && typeof parsed === "object") {
        setSaveData(parsed);
        setSaveFileName(null);
      } else {
        setLoadError(format === "json" ? "Invalid JSON: not an object." : "Invalid YAML: not an object.");
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Parse error.");
      setSaveData(null);
      setSaveFileName(null);
    }
  }, []);

  const loadFromFile = useCallback(async (file: File) => {
    setLoadError(null);
    const name = file.name.toLowerCase();
    const isSav = name.endsWith(".sav");
    const isJson = name.endsWith(".json") || file.type === "application/json";
    const isYaml = name.endsWith(".yaml") || name.endsWith(".yml") || name.endsWith(".txt");
    if (isSav) {
      setLoadError("Choose “Open .sav” and enter your Epic or Steam User ID to decrypt here.");
      return;
    }
    if (!isJson && !isYaml) {
      setLoadError("Use a .sav (with User ID), .json, or .yaml/.txt file.");
      return;
    }
    try {
      const text = await file.text();
      loadFromText(text, isJson ? "json" : "yaml");
      setSaveFileName(file.name);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to read file.");
      setSaveData(null);
      setSaveFileName(null);
    }
  }, [loadFromText]);

  const decryptSav = useCallback(async (encBytes: Uint8Array, userId: string, originalSavFileName?: string | null) => {
    setLoadError(null);
    const uid = userId.trim();
    if (!uid) {
      setLoadError("Epic or Steam User ID is required.");
      return;
    }
    try {
      const base64 = bytesToBase64(encBytes);
      const res = await fetch("/api/save/decrypt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid, sav_data: base64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(typeof data.error === "string" ? data.error : "Decrypt failed. Is the API running?");
        setSaveData(null);
        setSaveFileName(null);
        setSaveUserId(null);
        setSavePlatform(null);
        setRawYamlUtf8(null);
        setRawBytesBase64(null);
        return;
      }
      if (!data.success || typeof data.yaml_content !== "string" || !data.platform) {
        setLoadError("Invalid response from server.");
        setSaveData(null);
        setSaveFileName(null);
        setSaveUserId(null);
        setSavePlatform(null);
        setRawYamlUtf8(null);
        setRawBytesBase64(null);
        return;
      }
      const parsed = yamlParse(data.yaml_content) as SaveData;
      if (!parsed || typeof parsed !== "object") {
        setLoadError("Decrypted data is not a valid save object.");
        return;
      }
      setSaveData(parsed);
      setSaveFileName(originalSavFileName ?? null);
      setSaveUserId(uid);
      setSavePlatform(data.platform);
      setRawYamlUtf8(data.yaml_content);
      setRawBytesBase64(typeof data.raw_bytes_base64 === "string" ? data.raw_bytes_base64 : null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Decrypt failed. Is the API running?");
      setSaveData(null);
      setSaveFileName(null);
      setSaveUserId(null);
      setSavePlatform(null);
      setRawYamlUtf8(null);
      setRawBytesBase64(null);
    }
  }, []);

  const updateSaveData = useCallback((data: SaveData) => {
    setSaveData(data);
    setRawYamlUtf8(null);
    setRawBytesBase64(null);
  }, []);

  const doEncryptDownload = useCallback(
    async (body: Record<string, unknown>, defaultFilename: string) => {
      const res = await fetch("/api/save/encrypt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoadError(typeof data.error === "string" ? data.error : "Encrypt failed. Is the API running?");
        return;
      }
      const buf = await res.arrayBuffer();
      const disposition = res.headers.get("Content-Disposition");
      let name = defaultFilename;
      const match = disposition?.match(/filename="([^"]+)"/);
      if (match) name = match[1];
      const blob = new Blob([buf], { type: "application/octet-stream" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    []
  );

  const downloadAsSav = useCallback(
    async (filename?: string) => {
      if (!saveData || !saveUserId || !savePlatform) {
        setLoadError("Cannot create .sav: save was not decrypted from a .sav (need User ID and platform). Export as YAML/JSON instead, or decrypt a .sav first.");
        return;
      }
      setLoadError(null);
      const defaultName = filename ?? saveFileName?.replace(/\.(json|yaml|yml|txt)$/i, ".sav") ?? "bl4-save.sav";
      const body: Record<string, unknown> = {
        user_id: saveUserId,
        platform: savePlatform,
        filename: defaultName,
      };
      if (rawBytesBase64) {
        body.raw_bytes_base64 = rawBytesBase64;
      } else {
        body.yaml_content = rawYamlUtf8 ?? yamlStringify(saveData, { indent: 2 });
      }
      try {
        await doEncryptDownload(body, defaultName);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Encrypt failed. Is the API running?");
      }
    },
    [saveData, saveUserId, savePlatform, saveFileName, rawYamlUtf8, rawBytesBase64, doEncryptDownload]
  );

  const downloadRebuiltSavNoEdit = useCallback(
    async (filename?: string) => {
      if (!rawBytesBase64 || !saveUserId || !savePlatform) {
        setLoadError("No-edit roundtrip requires a decrypted .sav (no edits). Decrypt a .sav first.");
        return;
      }
      setLoadError(null);
      const defaultName = filename ?? saveFileName?.replace(/\.(json|yaml|yml|txt)$/i, ".sav") ?? "save_rebuilt.sav";
      try {
        await doEncryptDownload(
          {
            user_id: saveUserId,
            platform: savePlatform,
            raw_bytes_base64: rawBytesBase64,
            filename: defaultName,
          },
          defaultName
        );
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Encrypt failed. Is the API running?");
      }
    },
    [rawBytesBase64, saveUserId, savePlatform, saveFileName, doEncryptDownload]
  );

  const clearSave = useCallback(() => {
    setSaveData(null);
    setSaveFileName(null);
    setLoadError(null);
    setSaveUserId(null);
    setSavePlatform(null);
    setRawYamlUtf8(null);
    setRawBytesBase64(null);
  }, []);

  const getYamlText = useCallback(() => {
    if (rawYamlUtf8) return rawYamlUtf8;
    if (saveData) return yamlStringify(saveData, { indent: 2 });
    return "";
  }, [rawYamlUtf8, saveData]);

  const exportAsJson = useCallback(
    (filename?: string) => {
      if (!saveData) return;
      const json = JSON.stringify(saveData, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename ?? saveFileName ?? "bl4-save.json";
      a.click();
      URL.revokeObjectURL(a.href);
    },
    [saveData, saveFileName]
  );

  const exportAsYaml = useCallback(
    (filename?: string) => {
      if (!saveData) return;
      const yml = yamlStringify(saveData, { indent: 2 });
      const blob = new Blob([yml], { type: "text/yaml" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const base = saveFileName?.replace(/\.(json|yaml|yml|txt)$/i, "") ?? "bl4-save";
      a.download = filename ?? `${base}.yaml`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    [saveData, saveFileName]
  );

  const value = useMemo(
    () => ({
      saveData,
      saveFileName,
      loadError,
      summary,
      saveUserId,
      savePlatform,
      loadFromFile,
      loadFromText,
      decryptSav,
      clearSave,
      exportAsJson,
      exportAsYaml,
      downloadAsSav,
      downloadRebuiltSavNoEdit,
      hasRawBytesForRoundtrip: rawBytesBase64 != null,
      updateSaveData,
      getYamlText,
    }),
    [
      saveData,
      saveFileName,
      loadError,
      summary,
      saveUserId,
      savePlatform,
      loadFromFile,
      loadFromText,
      decryptSav,
      clearSave,
      exportAsJson,
      exportAsYaml,
      downloadAsSav,
      downloadRebuiltSavNoEdit,
      rawBytesBase64,
      updateSaveData,
      getYamlText,
    ]
  );

  return <SaveContext.Provider value={value}>{children}</SaveContext.Provider>;
}

export function useSave() {
  const ctx = useContext(SaveContext);
  if (!ctx) throw new Error("useSave must be used within SaveProvider");
  return ctx;
}
