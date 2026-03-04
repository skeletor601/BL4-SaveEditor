import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  buildPartsByCode,
  formatTranslatedLine,
  parseDecodedSerial,
  translateParts,
  type PartLookupRow,
} from "@/lib/partsTranslator";
import { fetchApi } from "@/lib/apiClient";

export default function PartsTranslatorView() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [partsData, setPartsData] = useState<PartLookupRow[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorMsg("");
    fetchApi("parts/data")
      .then((r) => {
        if (!r.ok) throw new Error(`Parts API: ${r.status}`);
        return r.json();
      })
      .then((data: { items?: PartLookupRow[] }) => {
        if (cancelled) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setPartsData(items);
        setStatus("ready");
      })
      .catch((e) => {
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(e instanceof Error ? e.message : "Failed to load parts");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byCode = useMemo(() => buildPartsByCode(partsData), [partsData]);

  const runTranslate = useCallback(() => {
    const raw = input.trim();
    if (!raw) {
      setOutput("");
      setStatus("ready");
      return;
    }
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    const allParts: ReturnType<typeof parseDecodedSerial>["parts"] = [];
    const errors: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const decoded = lines[i].trim();
      if (!decoded) continue;
      const { parts } = parseDecodedSerial(decoded);
      if (parts.length === 0) {
        if (decoded.includes("||")) {
          // had header but no tokens
        } else {
          errors.push(`Line ${i + 1}: no "||" or no part tokens found`);
        }
        continue;
      }
      allParts.push(...parts);
    }
    if (allParts.length === 0) {
      setOutput(errors.length ? errors.join("\n") : "No part tokens found. Use decoded format: header||{type_id:part_id} ...");
      setStatus("ready");
      return;
    }
    const translated = translateParts(allParts, byCode);
    const outLines = translated.map(formatTranslatedLine);
    setOutput(outLines.join("\n"));
    setStatus("ready");
  }, [input, byCode]);

  const clearAll = useCallback(() => {
    setInput("");
    setOutput("");
    setStatus("ready");
  }, []);

  return (
    <div className="space-y-6">
      <Link to="/character/select-save" className="text-[var(--color-accent)] hover:underline inline-block">
        ← Select Save
      </Link>
      <h2 className="text-lg font-semibold text-[var(--color-accent)]">Parts Translator</h2>
      <p className="text-sm text-[var(--color-text-muted)]">
        Paste decoded serial strings (format: <code className="text-[var(--color-accent)]">header||&#123;type_id:part_id&#125; ...</code>). One per line for batch. Base85 decode is not available here yet — use Weapon Edit to decode first if needed.
      </p>

      {status === "error" && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-red-300 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[var(--color-text-muted)]">
            Input (decoded serials, one per line)
          </label>
          <textarea
            className="w-full min-h-[200px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] px-3 py-2 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
            placeholder="e.g. 1,2||{1:5}{3:12} or paste multiple lines"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[var(--color-text-muted)]">
            Part list (with quantities)
          </label>
          <pre className="w-full min-h-[200px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] px-3 py-2 font-mono text-sm text-[var(--color-text)] overflow-auto whitespace-pre-wrap break-words">
            {output || "Translated parts will appear here."}
          </pre>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runTranslate}
          disabled={status === "loading"}
          className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm hover:opacity-90 disabled:opacity-50"
        >
          {status === "loading" ? "Loading parts…" : "Translate"}
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] text-sm hover:bg-[var(--color-panel-border)]"
        >
          Clear
        </button>
        <span className="text-sm text-[var(--color-text-muted)]">
          {status === "loading"
            ? "Loading parts database…"
            : status === "ready"
              ? partsData.length > 0
                ? `${partsData.length} parts loaded`
                : "No parts data"
              : ""}
        </span>
      </div>
    </div>
  );
}
