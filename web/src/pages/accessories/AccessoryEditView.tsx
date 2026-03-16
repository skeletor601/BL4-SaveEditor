import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { parse as yamlParse } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import { fetchApi, getApiUnavailableError, isLikelyUnavailable } from "@/lib/apiClient";
import { FLAG_OPTIONS } from "@/components/weapon-toolbox/builderStyles";

interface AccessoryEditViewProps {
  title: string;
  description: string;
  suppressCodecPanels?: boolean;
  onCodecChange?: (payload: { base85: string; decoded: string }) => void;
  externalBase85?: string;
  externalDecoded?: string;
}

export default function AccessoryEditView({
  title,
  description,
  suppressCodecPanels = false,
  onCodecChange,
  externalBase85,
  externalDecoded,
}: AccessoryEditViewProps) {
  const { saveData, getYamlText, updateSaveData } = useSave();
  const [serialInput, setSerialInput] = useState("");
  const [decodedInput, setDecodedInput] = useState("");
  const [encodedSerial, setEncodedSerial] = useState("");
  const [flagValue, setFlagValue] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<"decode" | "encode" | "add" | null>(null);
  const applyingExternalRef = useRef(false);

  useEffect(() => {
    if (typeof externalBase85 === "string" && externalBase85 !== serialInput) {
      applyingExternalRef.current = true;
      setSerialInput(externalBase85);
      setEncodedSerial("");
    }
  }, [externalBase85, serialInput]);

  useEffect(() => {
    if (typeof externalDecoded === "string" && externalDecoded !== decodedInput) {
      applyingExternalRef.current = true;
      setDecodedInput(externalDecoded);
      setEncodedSerial("");
    }
  }, [externalDecoded, decodedInput]);

  useEffect(() => {
    if (applyingExternalRef.current) {
      applyingExternalRef.current = false;
      return;
    }
    onCodecChange?.({ base85: (encodedSerial || serialInput).trim(), decoded: decodedInput });
  }, [encodedSerial, serialInput, decodedInput, onCodecChange]);

  const handleDecode = useCallback(async () => {
    const raw = serialInput.trim();
    if (!raw || !raw.startsWith("@U")) {
      setMessage("Paste a Base85 serial (must start with @U).");
      return;
    }
    setLoading("decode");
    setMessage(null);
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
        setMessage("Decoded. Edit and Encode, or Add to Backpack.");
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
        setMessage(isLikelyUnavailable(res) ? getApiUnavailableError() : (data?.error ?? "Encode failed"));
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
        setMessage(isLikelyUnavailable(res) ? getApiUnavailableError() : (data?.error ?? "Add failed"));
        return;
      }
      if (data?.success && typeof data?.yaml_content === "string") {
        const parsed = yamlParse(data.yaml_content) as Record<string, unknown>;
        updateSaveData(parsed);
        setMessage(`${title} added to backpack. Use Overwrite save on Select Save to export.`);
      } else {
        setMessage(data?.error ?? "Add failed");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [encodedSerial, serialInput, saveData, flagValue, title, getYamlText, updateSaveData]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-muted)]">{description}</p>

      {!suppressCodecPanels && (
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
              {loading === "decode" ? "Decoding…" : "Decode"}
            </button>
          </div>

          <div className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
            <h3 className="text-[var(--color-accent)] font-medium mb-2">Deserialized string</h3>
            <textarea
              value={decodedInput}
              onChange={(e) => setDecodedInput(e.target.value)}
              placeholder="Paste decoded string"
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
      )}

      {(encodedSerial || serialInput.trim().startsWith("@U")) && (
        <div className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
          <h3 className="text-[var(--color-accent)] font-medium mb-2">Serial</h3>
          <textarea
            readOnly
            value={encodedSerial || serialInput}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-xs font-mono"
          />
          <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="text-sm text-[var(--color-text-muted)] sm:mr-1">Flag:</label>
            <select
              value={flagValue}
              onChange={(e) => setFlagValue(Number(e.target.value))}
              className="w-full sm:w-auto px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] min-h-[44px]"
            >
              {FLAG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddToBackpack}
              disabled={loading !== null || !saveData}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium hover:opacity-90 disabled:opacity-50 min-h-[44px]"
            >
              {loading === "add" ? "Adding…" : "Add to Backpack"}
            </button>
            {!saveData && (
              <Link to="/character/select-save" className="text-sm text-[var(--color-accent)] hover:underline w-full sm:w-auto">
                Load a save first
              </Link>
            )}
          </div>
        </div>
      )}

      {message && <p className="text-sm text-[var(--color-accent)]">{message}</p>}
    </div>
  );
}
