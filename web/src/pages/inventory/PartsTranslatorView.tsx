import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  buildPartsByCode,
  parseDecodedSerial,
  translateParts,
  type PartLookupRow,
  type TranslatedLine,
} from "@/lib/partsTranslator";
import { fetchApi } from "@/lib/apiClient";
import { usePersistedState } from "@/lib/usePersistedState";

function PartCard({ line }: { line: TranslatedLine }) {
  const [showFields, setShowFields] = useState(false);
  const hasFields = line.allFields && Object.keys(line.allFields).length > 0;
  return (
    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.8)] p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs text-[var(--color-accent)] shrink-0">{line.codeKey}</span>
        <span className="text-xs text-[var(--color-text-muted)] tabular-nums">×{line.qty}</span>
      </div>
      <p className="mt-1 text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{line.partType}</p>
      <p className="mt-0.5 text-sm font-medium text-[var(--color-text)] break-words">{line.name}</p>
      {line.stats ? (
        <p className="mt-1 text-xs text-[var(--color-text-muted)] line-clamp-2" title={line.stats}>
          {line.stats}
        </p>
      ) : null}
      {hasFields && (
        <button
          type="button"
          onClick={() => setShowFields((v) => !v)}
          className="mt-2 text-xs text-[var(--color-accent)] hover:underline"
        >
          {showFields ? "Hide details" : "Show all fields"}
        </button>
      )}
      {hasFields && showFields && (
        <dl className="mt-2 pt-2 border-t border-[var(--color-panel-border)] space-y-0.5 text-xs">
          {Object.entries(line.allFields!).map(([k, v]) => {
            const str = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
            return (
              <div key={k} className="flex gap-2 break-words">
                <dt className="text-[var(--color-text-muted)] shrink-0">{k}:</dt>
                <dd className="text-[var(--color-text)] min-w-0">{str}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

export default function PartsTranslatorView() {
  const [input, setInput] = usePersistedState("parts-translator.input", "");
  const [translatedLines, setTranslatedLines] = useState<TranslatedLine[]>([]);
  const [translateErrors, setTranslateErrors] = useState<string[]>([]);
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

  // Filter cards by search (left-to-right, top-to-bottom order preserved).
  const filteredLines = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return translatedLines;
    return translatedLines.filter(
      (line) =>
        line.codeKey.toLowerCase().includes(q) ||
        line.partType.toLowerCase().includes(q) ||
        line.name.toLowerCase().includes(q) ||
        (line.stats && line.stats.toLowerCase().includes(q)),
    );
  }, [translatedLines, filter]);

  const runTranslate = useCallback(async () => {
    const raw = input.trim();
    if (!raw) {
      setTranslatedLines([]);
      setTranslateErrors([]);
      setStatus("ready");
      return;
    }
    setStatus("loading");
    // Join continuation lines: if a line doesn't start with @ and doesn't contain ||,
    // it's a continuation of the previous decoded line (textarea wrapping).
    const rawLines = raw.split(/\r?\n/).filter((l) => l.trim());
    const lines: string[] = [];
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("@") || trimmed.includes("||") || lines.length === 0) {
        lines.push(trimmed);
      } else {
        // Continuation of previous line
        lines[lines.length - 1] += " " + trimmed;
      }
    }
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
          setTranslatedLines([]);
          setTranslateErrors([data?.error ?? `Decode failed (${res.status})`]);
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
        setTranslatedLines([]);
        setTranslateErrors([e instanceof Error ? e.message : "Decode failed"]);
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
      setTranslatedLines([]);
      setTranslateErrors(errors.length ? errors : ["No part tokens found. Paste Base85 (@...) or decoded tokens."]);
      setStatus("ready");
      return;
    }
    // translateParts returns lines in left-to-right, top-to-bottom order (by firstIndex).
    const translated = translateParts(allParts, byCode);
    setTranslatedLines(translated);
    setTranslateErrors(errors);
    setStatus("ready");
  }, [input, byCode]);

  const clearAll = useCallback(() => {
    setInput("");
    setTranslatedLines([]);
    setTranslateErrors([]);
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
              Part list (left to right, top to bottom)
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
          <div className="min-h-[260px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.4)] p-3 overflow-auto">
            {filteredLines.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredLines.map((line, idx) => (
                  <PartCard key={`${line.codeKey}-${idx}`} line={line} />
                ))}
              </div>
            ) : translateErrors.length > 0 ? (
              <div className="space-y-1 text-sm text-red-300/90">
                {translateErrors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            ) : translatedLines.length > 0 && filter.trim() ? (
              <p className="text-sm text-[var(--color-text-muted)]">No results match this filter.</p>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">Translated parts will appear here as cards.</p>
            )}
          </div>
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
