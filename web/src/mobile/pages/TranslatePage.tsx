import { useState, useEffect, useCallback } from "react";
import { fetchApi } from "@/lib/apiClient";
import { showToast } from "../components/Toast";

interface PartRow {
  code: string;
  label: string;
  partType?: string;
  rarity?: string;
}

const rarityColor = (r?: string) => {
  const rl = (r ?? "").toLowerCase();
  if (rl === "pearl" || rl === "pearlescent") return "#38bdf8";
  if (rl === "legendary") return "#fbbf24";
  if (rl === "epic") return "#a78bfa";
  if (rl === "rare") return "#60a5fa";
  if (rl === "uncommon") return "#4ade80";
  return "var(--color-text)";
};

export default function MobileTranslatePage() {
  const [partsDb, setPartsDb] = useState<PartRow[]>([]);

  // Decode tab
  const [base85Input, setBase85Input] = useState("");
  const [decodedResult, setDecodedResult] = useState("");
  const [decoding, setDecoding] = useState(false);

  // Encode tab
  const [decodedInput, setDecodedInput] = useState("");
  const [encodedResult, setEncodedResult] = useState("");
  const [encoding, setEncoding] = useState(false);

  const [activeTab, setActiveTab] = useState<"decode" | "encode" | "translate">("decode");

  // Translate state
  const [translateInput, setTranslateInput] = useState("");

  useEffect(() => {
    fetchApi("parts/data").then((r) => r.json()).then((d: { items?: Record<string, unknown>[] }) => {
      if (!d.items) return;
      setPartsDb(d.items.map((raw) => ({
        code: String(raw.code ?? ""),
        label: String(raw.partName ?? raw.itemType ?? ""),
        partType: String(raw.partType ?? ""),
        rarity: String(raw.rarity ?? ""),
      })).filter((p) => p.code));
    }).catch(() => {});
  }, []);

  const nameMap = new Map<string, PartRow>();
  for (const p of partsDb) if (p.code) nameMap.set(p.code, p);

  const handleDecode = useCallback(async () => {
    const serial = base85Input.trim();
    if (!serial) return;
    setDecoding(true);
    try {
      const res = await fetchApi("save/decode-serial", { method: "POST", body: JSON.stringify({ serial }) });
      const d = await res.json();
      if (d?.success && typeof d?.decoded === "string") setDecodedResult(d.decoded);
      else setDecodedResult("Decode failed");
    } catch { setDecodedResult("Decode error"); }
    setDecoding(false);
  }, [base85Input]);

  const handleEncode = useCallback(async () => {
    const decoded = decodedInput.trim();
    if (!decoded) return;
    setEncoding(true);
    try {
      const res = await fetchApi("save/encode-serial", { method: "POST", body: JSON.stringify({ decoded_string: decoded.split(/\r?\n/)[0]?.trim() ?? "" }) });
      const d = await res.json();
      if (d?.success && typeof d?.serial === "string") setEncodedResult(d.serial);
      else setEncodedResult("Encode failed");
    } catch { setEncodedResult("Encode error"); }
    setEncoding(false);
  }, [decodedInput]);

  // Parse decoded string into parts for translation
  const translateParts = useCallback(() => {
    const input = translateInput.trim() || decodedResult.trim();
    if (!input) return [];
    const first = input.split(/\r?\n/)[0]?.trim() ?? "";
    const idx = first.indexOf("||");
    if (idx === -1) return [];
    const segment = first.slice(idx + 2).replace(/\|\s*$/, "").replace(/"c",\s*"[^"]*"\s*\|?\s*$/, "").trim();
    const beforePipe = first.split("|")[0].trim();
    const headerTypeId = parseInt(beforePipe.split(",")[0].trim(), 10) || null;

    const parts: { code: string; qty: number }[] = [];
    const regex = /\{(\d+)(?::(\d+|\[[\d\s]+\]))?\}/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(segment)) !== null) {
      const outer = Number(m[1]);
      const inner = m[2];
      if (!inner) {
        parts.push({ code: `{${headerTypeId ?? outer}:${outer}}`, qty: 1 });
      } else if (inner.includes("[")) {
        const subIds = inner.replace(/[\[\]]/g, "").trim().split(/\s+/).filter(Boolean).map(Number);
        const counts = new Map<number, number>();
        for (const id of subIds) counts.set(id, (counts.get(id) ?? 0) + 1);
        for (const [partId, qty] of counts) parts.push({ code: `{${outer}:${partId}}`, qty });
      } else {
        parts.push({ code: `{${outer}:${Number(inner)}}`, qty: 1 });
      }
    }
    return parts;
  }, [translateInput, decodedResult]);

  const tabStyle = (active: boolean) => ({
    flex: 1, minHeight: 44, padding: "10px 0",
    borderRadius: 8, border: "none",
    background: active ? "var(--color-accent-dim)" : "transparent",
    color: active ? "var(--color-accent)" : "var(--color-text-muted)",
    fontSize: 12, fontWeight: 700 as const, textTransform: "uppercase" as const,
    letterSpacing: 0.5, cursor: "pointer", touchAction: "manipulation" as const,
  });

  return (
    <div>
      <div className="mobile-page-header">
        <h1>Parts Translator</h1>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 4 }}>
        <button type="button" style={tabStyle(activeTab === "decode")} onClick={() => setActiveTab("decode")}>Decode</button>
        <button type="button" style={tabStyle(activeTab === "encode")} onClick={() => setActiveTab("encode")}>Encode</button>
        <button type="button" style={tabStyle(activeTab === "translate")} onClick={() => setActiveTab("translate")}>Translate</button>
      </div>

      {/* Decode tab */}
      {activeTab === "decode" && (
        <div className="mobile-card">
          <div className="mobile-label">Paste Base85 Code</div>
          <textarea className="mobile-textarea" value={base85Input} onChange={(e) => setBase85Input(e.target.value)} rows={3} placeholder="@U..." style={{ marginBottom: 8 }} />
          <button type="button" className="mobile-btn primary" onClick={handleDecode} disabled={decoding} style={{ marginBottom: 10 }}>
            {decoding ? "Decoding…" : "Decode"}
          </button>
          {decodedResult && (
            <>
              <div className="mobile-label">Decoded Result</div>
              <textarea className="mobile-textarea" value={decodedResult} readOnly rows={3} style={{ marginBottom: 8 }} />
              <button type="button" className="mobile-btn" onClick={() => { navigator.clipboard.writeText(decodedResult).then(() => showToast("Copied!")).catch(() => showToast("Copy failed")); }}>
                Copy Decoded
              </button>
            </>
          )}
        </div>
      )}

      {/* Encode tab */}
      {activeTab === "encode" && (
        <div className="mobile-card">
          <div className="mobile-label">Paste Decoded String</div>
          <textarea className="mobile-textarea" value={decodedInput} onChange={(e) => setDecodedInput(e.target.value)} rows={3} placeholder="263, 0, 1, 50| 2, 1|| {parts} |" style={{ marginBottom: 8 }} />
          <button type="button" className="mobile-btn primary" onClick={handleEncode} disabled={encoding} style={{ marginBottom: 10 }}>
            {encoding ? "Encoding…" : "Encode to Base85"}
          </button>
          {encodedResult && (
            <>
              <div className="mobile-label">Base85 Result</div>
              <textarea className="mobile-textarea" value={encodedResult} readOnly rows={2} style={{ marginBottom: 8 }} />
              <button type="button" className="mobile-btn" onClick={() => { navigator.clipboard.writeText(encodedResult).then(() => showToast("Copied!")).catch(() => showToast("Copy failed")); }}>
                Copy Base85
              </button>
            </>
          )}
        </div>
      )}

      {/* Translate tab */}
      {activeTab === "translate" && (
        <div className="mobile-card">
          <div className="mobile-label">Paste Decoded String</div>
          <textarea
            className="mobile-textarea"
            value={translateInput}
            onChange={(e) => setTranslateInput(e.target.value)}
            rows={3}
            placeholder="Paste decoded string to see part names…"
            style={{ marginBottom: 10 }}
          />
          {(() => {
            const parts = translateParts();
            if (parts.length === 0) return <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Paste a decoded string above to translate parts</p>;
            return (
              <div>
                <div className="mobile-label">Parts ({parts.length})</div>
                <div style={{ maxHeight: 300, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
                  {parts.map((part, i) => {
                    const info = nameMap.get(part.code);
                    return (
                      <div key={`${part.code}-${i}`} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                        fontSize: 12,
                      }}>
                        <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--color-accent)", opacity: 0.6, flexShrink: 0, minWidth: 52 }}>
                          {part.code}
                        </span>
                        <span style={{ flex: 1, color: rarityColor(info?.rarity), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {info?.label ?? part.code}
                        </span>
                        {part.qty > 1 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-accent)", background: "var(--color-accent-dim)", padding: "1px 6px", borderRadius: 8 }}>
                            x{part.qty}
                          </span>
                        )}
                        {info?.partType && (
                          <span style={{ fontSize: 9, color: "var(--color-text-muted)", background: "rgba(255,255,255,0.05)", padding: "2px 5px", borderRadius: 3, flexShrink: 0 }}>
                            {info.partType}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
