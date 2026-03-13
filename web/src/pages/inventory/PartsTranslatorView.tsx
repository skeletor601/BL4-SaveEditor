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
import { usePersistedState } from "@/lib/usePersistedState";

export default function PartsTranslatorView() {
  const [input, setInput] = usePersistedState("parts-translator.input", "");
  const [output, setOutput] = usePersistedState("parts-translator.output", "");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [partsData, setPartsData] = useState<PartLookupRow[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [filter, setFilter] = useState("");

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

  const filteredOutput = useMemo(() => {
    const base = output || "";
    const q = filter.trim().toLowerCase();
    if (!base || !q) return base;
    const lines = base.split(/\r?\n/);
    const filteredLines = lines.filter((line) => line.toLowerCase().includes(q));
    return filteredLines.join("\n");
  }, [output, filter]);

  const runTranslate = useCallback(async () => {
    const raw = input.trim();
    if (!raw) {
      setOutput("");
      setStatus("ready");
      return;
    }
    setStatus("loading");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    const decodedLines: string[] = Array(lines.length).fill("");
    const serials: string[] = [];
    const serialLineIndexes: number[] = [];
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("@")) {
        serials.push(trimmed);
        serialLineIndexes.push(idx);
      } else {
        decodedLines[idx] = trimmed;
      }
    });

    if (serials.length > 0) {
      try {
        const res = await fetchApi("save/decode-items", {
          method: "POST",
          body: JSON.stringify({ serials }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setOutput(data?.error ?? `Decode failed (${res.status})`);
          setStatus("ready");
          return;
        }
        const items = Array.isArray(data?.items) ? data.items : [];
        serialLineIndexes.forEach((lineIdx, itemIdx) => {
          const item = items[itemIdx];
          if (item?.error) decodedLines[lineIdx] = `__ERROR__:${item.error}`;
          else if (typeof item?.decodedFull === "string" && item.decodedFull.trim()) decodedLines[lineIdx] = item.decodedFull.trim();
          else decodedLines[lineIdx] = "__ERROR__:No decoded output";
        });
      } catch (e) {
        setOutput(e instanceof Error ? e.message : "Decode failed");
        setStatus("ready");
        return;
      }
    }

    const allParts: ReturnType<typeof parseDecodedSerial>["parts"] = [];
    const errors: string[] = [];
    for (let i = 0; i < decodedLines.length; i++) {
      const decoded = decodedLines[i].trim();
      if (!decoded) continue;
      if (decoded.startsWith("__ERROR__:")) {
        errors.push(`Line ${i + 1}: ${decoded.replace("__ERROR__:", "")}`);
        continue;
      }
      const { parts } = parseDecodedSerial(decoded);
      if (parts.length === 0) {
        errors.push(`Line ${i + 1}: no part tokens found`);
        continue;
      }
      allParts.push(...parts);
    }
    if (allParts.length === 0) {
      setOutput(errors.length ? errors.join("\n") : "No part tokens found. Paste Base85 (@...) or decoded tokens.");
      setStatus("ready");
      return;
    }
    const translated = translateParts(allParts, byCode);
    const outLines = translated.map(formatTranslatedLine);
    setOutput(errors.length ? `${outLines.join("\n")}\n\n${errors.join("\n")}` : outLines.join("\n"));
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
        Paste Base85 (<code className="text-[var(--color-accent)]">@...</code>) or decoded serial strings
        (format: <code className="text-[var(--color-accent)]">header||&#123;type_id:part_id&#125; ...</code>).
        One per line for batch.
      </p>

      {status === "error" && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-red-300 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[var(--color-text-muted)]">
            Input (Base85 or decoded serials, one per line)
          </label>
          <textarea
            className="w-full min-h-[200px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] px-3 py-2 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
            placeholder='e.g. @U... or 1,2||{1:5}{3:12} or "c", "Cosmetics_Weapon_..."'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="block text-sm font-medium text-[var(--color-text-muted)]">
              Part list (with quantities)
            </label>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter results..."
              className="px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-xs min-w-[160px] focus:outline-none focus:border-[var(--color-accent)]"
              spellCheck={false}
            />
          </div>
          <pre className="w-full min-h-[260px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] px-4 py-3 font-mono text-sm text-[var(--color-text)] overflow-auto whitespace-pre-wrap break-words">
            {filteredOutput || (output ? "No results match this filter." : "Translated parts will appear here.")}
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
