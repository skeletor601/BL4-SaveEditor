/**
 * Mobile Build from URL: paste Maxroll/Mobalytics link → assemble gear → copy codes to clipboard.
 */
import { useState, useCallback } from "react";
import { fetchApi } from "@/lib/apiClient";

interface StockItem {
  slot: string; category: string; itemName: string; manufacturer: string;
  weaponType?: string; element?: string; decoded: string; typeId: string;
  confidence: "exact" | "fuzzy" | "not_found"; notes?: string;
}

interface AssembleResponse {
  buildName: string; character: string; variantName: string;
  items: StockItem[]; skipped: { slot: string; reason: string }[];
}

const CATEGORY_ICONS: Record<string, string> = {
  Weapon: "🔫", Shield: "🛡", Grenade: "💣", Repkit: "💉", "Class Mod": "🧬", Enhancement: "⚡",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  exact: "#4ade80", fuzzy: "#facc15", not_found: "#f87171",
};

export default function MobileBuildFromUrl() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssembleResponse | null>(null);
  const [level, setLevel] = useState(60);
  const [copied, setCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // YouTube-specific state
  const [ytWarning, setYtWarning] = useState(false);
  const [ytMessage, setYtMessage] = useState<string | null>(null);
  const [ytPendingUrl, setYtPendingUrl] = useState<string | null>(null);

  const isYouTube = (u: string) =>
    u.includes("youtube.com") || u.includes("youtu.be");

  /** Assemble from a Maxroll URL (reused for YouTube planner-link redirect) */
  const assembleMaxroll = async (maxrollUrl: string) => {
    const res = await fetchApi("maxroll/assemble", {
      method: "POST", body: JSON.stringify({ url: maxrollUrl, level }),
    });
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
    return (await res.json()) as AssembleResponse;
  };

  /** Assemble from a Mobalytics URL */
  const assembleMobalytics = async (mobaUrl: string) => {
    const scrapeRes = await fetchApi("build-from-url/scrape", {
      method: "POST", body: JSON.stringify({ url: mobaUrl }),
    });
    if (!scrapeRes.ok) { const b = await scrapeRes.json().catch(() => ({})); throw new Error(b.error || `HTTP ${scrapeRes.status}`); }
    const scrapeData = await scrapeRes.json();

    const variant = scrapeData.variants?.[0];
    if (!variant) throw new Error("No build variant found");

    const assembleRes = await fetchApi("build-from-url/assemble", {
      method: "POST",
      body: JSON.stringify({
        buildName: scrapeData.buildName,
        character: scrapeData.character,
        variantName: variant.name,
        resolved: scrapeData.resolved || [],
        context: scrapeData.context,
        firmware: variant.firmware || [],
        level,
      }),
    });
    if (!assembleRes.ok) { const b = await assembleRes.json().catch(() => ({})); throw new Error(b.error || `HTTP ${assembleRes.status}`); }
    return (await assembleRes.json()) as AssembleResponse;
  };

  /** Build from YouTube transcript (no planner link found) */
  const assembleYouTube = async (ytUrl: string) => {
    const res = await fetchApi("youtube/build", {
      method: "POST", body: JSON.stringify({ url: ytUrl, level }),
    });
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
    return (await res.json()) as AssembleResponse;
  };

  const handleScrape = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true); setError(null); setResult(null); setCopied(false);
    setYtWarning(false); setYtMessage(null); setYtPendingUrl(null);

    const trimmed = url.trim();

    try {
      if (isYouTube(trimmed)) {
        // Step 1: check for planner links in the video
        const checkRes = await fetchApi("youtube/check-links", {
          method: "POST", body: JSON.stringify({ url: trimmed }),
        });
        if (!checkRes.ok) { const b = await checkRes.json().catch(() => ({})); throw new Error(b.error || `HTTP ${checkRes.status}`); }
        const checkData = await checkRes.json() as {
          title: string; plannerLinks: string[]; hasTranscript: boolean;
        };

        if (checkData.plannerLinks.length > 0) {
          // Found a planner link — use it directly
          const link = checkData.plannerLinks[0];
          const isMaxrollLink = link.includes("maxroll.gg");
          setYtMessage(`Found a ${isMaxrollLink ? "Maxroll" : "Mobalytics"} link in this video!`);
          const data = isMaxrollLink
            ? await assembleMaxroll(link)
            : await assembleMobalytics(link);
          setResult(data);
        } else {
          // No planner link — show warning, let user decide
          setYtWarning(true);
          setYtPendingUrl(trimmed);
          setLoading(false);
          return;
        }
      } else if (trimmed.includes("maxroll.gg")) {
        setResult(await assembleMaxroll(trimmed));
      } else {
        setResult(await assembleMobalytics(trimmed));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [url, level]);

  /** "Continue Anyway" — build from YouTube transcript */
  const handleYtContinue = useCallback(async () => {
    if (!ytPendingUrl) return;
    setLoading(true); setError(null); setYtWarning(false); setYtMessage(null);
    try {
      setResult(await assembleYouTube(ytPendingUrl));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
      setYtPendingUrl(null);
    }
  }, [ytPendingUrl, level]);

  const handleCopyAll = useCallback(async () => {
    if (!result) return;
    const codes = result.items.map(item =>
      `${item.itemName} (${item.manufacturer}${item.weaponType ? " " + item.weaponType : ""}):\n${item.decoded}`
    ).join("\n\n");
    try {
      await navigator.clipboard.writeText(codes);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = codes;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  }, [result]);

  const handleCopyOne = useCallback(async (decoded: string) => {
    try {
      await navigator.clipboard.writeText(decoded);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = decoded;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }, []);

  if (!showModal) {
    return (
      <button
        type="button"
        className="mobile-btn"
        onClick={() => setShowModal(true)}
        style={{
          marginBottom: 14,
          background: "rgba(168,85,247,0.15)",
          borderColor: "#a855f7",
          color: "#a855f7",
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        Build from URL
      </button>
    );
  }

  return (
    <div className="mobile-picker-overlay" onClick={() => setShowModal(false)}>
      <div
        className="mobile-picker-sheet"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mobile-picker-header">
          <h3>Build from URL</h3>
          <button
            type="button"
            onClick={() => setShowModal(false)}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, color: "var(--color-text)", fontSize: 13,
              fontWeight: 700, padding: "6px 14px", cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div style={{ padding: 14, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {/* URL Input */}
          {!result && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 10, lineHeight: 1.5 }}>
                Paste a <strong>Maxroll</strong>, <strong>Mobalytics</strong>, or <strong>YouTube</strong> build URL. All gear will be assembled with godroll parts, crit knife, and optimal perks.
              </p>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://maxroll.gg/... or youtube.com/..."
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 10,
                  border: "1px solid var(--color-panel-border)",
                  background: "var(--color-bg)", color: "var(--color-text)",
                  fontSize: 14, marginBottom: 10, boxSizing: "border-box",
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handleScrape(); }}
                disabled={loading}
              />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Level</span>
                  <input
                    type="number"
                    min={1} max={60} value={level}
                    onChange={(e) => setLevel(Math.max(1, Math.min(60, Number(e.target.value) || 60)))}
                    style={{
                      width: 50, padding: "6px 8px", borderRadius: 8, textAlign: "center",
                      border: "1px solid var(--color-panel-border)",
                      background: "var(--color-bg)", color: "var(--color-text)", fontSize: 13,
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="mobile-btn primary"
                  onClick={handleScrape}
                  disabled={loading || !url.trim()}
                  style={{ flex: 1 }}
                >
                  {loading ? "Assembling..." : "Build"}
                </button>
              </div>
            </div>
          )}

          {/* YouTube: planner link found message */}
          {ytMessage && (
            <div style={{
              padding: 12, borderRadius: 10, marginBottom: 12,
              border: "1px solid rgba(74,222,128,0.4)", background: "rgba(74,222,128,0.1)",
              color: "#4ade80", fontSize: 13, fontWeight: 600,
            }}>
              {ytMessage}
            </div>
          )}

          {/* YouTube: no planner link warning */}
          {ytWarning && (
            <div style={{
              padding: 14, borderRadius: 10, marginBottom: 12,
              border: "1px solid rgba(250,204,21,0.4)", background: "rgba(250,204,21,0.08)",
            }}>
              <p style={{ fontSize: 13, color: "#facc15", margin: "0 0 10px", lineHeight: 1.5 }}>
                YouTube builds are extracted from video transcripts. Results may vary. For best results, use a Maxroll or Mobalytics link directly.
              </p>
              <button
                type="button"
                className="mobile-btn"
                onClick={handleYtContinue}
                disabled={loading}
                style={{
                  width: "100%", padding: "10px 16px",
                  background: "rgba(250,204,21,0.15)", borderColor: "#facc15",
                  color: "#facc15", fontSize: 13, fontWeight: 700,
                }}
              >
                {loading ? "Extracting..." : "Continue Anyway"}
              </button>
            </div>
          )}

          {error && (
            <div style={{
              padding: 12, borderRadius: 10, marginBottom: 12,
              border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)",
              color: "#f87171", fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text)", margin: 0 }}>
                    {result.buildName}
                  </h3>
                  <p style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "capitalize", margin: "2px 0 0" }}>
                    {result.character} {result.variantName ? `— ${result.variantName}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setResult(null); setError(null); setCopied(false); setYtMessage(null); }}
                  style={{
                    background: "none", border: "none",
                    color: "var(--color-text-muted)", fontSize: 12, cursor: "pointer",
                  }}
                >
                  Back
                </button>
              </div>

              {/* Copy All button */}
              <button
                type="button"
                onClick={handleCopyAll}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: 10, marginBottom: 14,
                  border: copied ? "1px solid #4ade80" : "1px solid #a855f7",
                  background: copied ? "rgba(74,222,128,0.15)" : "rgba(168,85,247,0.15)",
                  color: copied ? "#4ade80" : "#a855f7",
                  fontSize: 14, fontWeight: 700, cursor: "pointer", touchAction: "manipulation",
                }}
              >
                {copied ? "Copied to Clipboard!" : `Copy All ${result.items.length} Codes`}
              </button>

              {/* Items */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {result.items.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 10, borderRadius: 10,
                      border: "1px solid var(--color-panel-border)",
                      background: "rgba(0,0,0,0.2)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 14 }}>{CATEGORY_ICONS[item.category] || "?"}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.itemName}
                        </span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4,
                          background: `${CONFIDENCE_COLORS[item.confidence]}22`,
                          color: CONFIDENCE_COLORS[item.confidence],
                          border: `1px solid ${CONFIDENCE_COLORS[item.confidence]}44`,
                        }}>
                          {item.confidence === "exact" ? "EXACT" : item.confidence === "fuzzy" ? "FUZZY" : "?"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyOne(item.decoded)}
                        style={{
                          background: "rgba(168,85,247,0.15)", border: "1px solid #a855f766",
                          borderRadius: 6, color: "#a855f7", fontSize: 10, fontWeight: 700,
                          padding: "4px 8px", cursor: "pointer", touchAction: "manipulation", flexShrink: 0,
                        }}
                      >
                        Copy
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                        {item.manufacturer}{item.weaponType ? ` ${item.weaponType}` : ""}
                      </span>
                      {item.element && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#facc15" }}>{item.element}</span>
                      )}
                      {item.notes && (
                        <span style={{ fontSize: 10, color: "var(--color-text-muted)", fontStyle: "italic" }}>{item.notes}</span>
                      )}
                    </div>
                    <div
                      style={{
                        padding: "6px 8px", borderRadius: 6,
                        background: "rgba(0,0,0,0.3)", border: "1px solid var(--color-panel-border)",
                        fontSize: 10, fontFamily: "monospace", color: "var(--color-text-muted)",
                        wordBreak: "break-all", lineHeight: 1.4,
                        WebkitUserSelect: "all", userSelect: "all",
                      }}
                      onClick={() => handleCopyOne(item.decoded)}
                    >
                      {item.decoded.length > 150 ? item.decoded.slice(0, 150) + "..." : item.decoded}
                    </div>
                  </div>
                ))}
              </div>

              {/* Skipped */}
              {result.skipped.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                    Skipped ({result.skipped.length})
                  </p>
                  {result.skipped.map((s, i) => (
                    <p key={i} style={{ fontSize: 11, color: "#f87171" }}>{s.slot}: {s.reason}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
