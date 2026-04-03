/**
 * Loot Lobby — Batch inject items and drop them on the ground.
 * For PC hosts sharing modded items with console players.
 */

import { useState } from "react";
import { showToast } from "../components/Toast";

export default function LootLobbyPage() {
  const [codes, setCodes] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [injectedCount, setInjectedCount] = useState(0);
  const [dropping, setDropping] = useState(false);

  const serials = codes
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("@U"));

  const handleInject = async () => {
    if (serials.length === 0) {
      setStatus("Paste @U codes first (one per line)");
      return;
    }
    setWorking(true);
    setStatus("Injecting...");
    try {
      const { batchInject } = await import("@/lib/injectorBridge");
      const resp = await batchInject(serials);
      if (resp.ok) {
        setInjectedCount(resp.injected ?? 0);
        setStatus(`Injected ${resp.injected} items into backpack!`);
        showToast(`${resp.injected} items injected!`);
      } else {
        setStatus(resp.error ?? "Injection failed");
        showToast(resp.error ?? "Failed");
      }
    } catch {
      setStatus("Bridge not running. Start BL4_Injector.exe");
    }
    setWorking(false);
  };

  const handleDrop = async () => {
    if (injectedCount <= 0) {
      setStatus("Inject items first, then drop");
      return;
    }
    setDropping(true);
    setStatus(`Dropping ${injectedCount} items... Open inventory & hover first item!`);
    try {
      const { dropAll } = await import("@/lib/injectorBridge");
      const resp = await dropAll(injectedCount);
      if (resp.ok) {
        setStatus(`Dropped ${resp.dropped} items on the ground!`);
        showToast(`${resp.dropped} items dropped!`);
        setInjectedCount(0);
      } else {
        setStatus(resp.error ?? "Drop failed");
      }
    } catch {
      setStatus("Bridge not running");
    }
    setDropping(false);
  };

  return (
    <div style={{ padding: "0 0 80px" }}>
      <div className="mobile-card">
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--color-accent)", marginBottom: 4 }}>
          Loot Lobby
        </h2>
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 14, lineHeight: 1.4 }}>
          Batch inject modded items and drop them for others to pick up.
          Requires BL4_Injector.exe running on your PC.
        </p>

        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", lineHeight: 1.5 }}>
          <strong style={{ color: "var(--color-text)" }}>How it works:</strong><br />
          1. Generate modded items in the builders, copy the Base85 codes<br />
          2. Paste all codes below (one per line)<br />
          3. Click "Inject All" — items go into your backpack<br />
          4. Open inventory, hover first new item<br />
          5. Click "Drop All" — items fall on the ground for others
        </div>
      </div>

      <div className="mobile-card">
        <div className="mobile-label">
          @U Codes ({serials.length} items)
        </div>
        <textarea
          className="mobile-textarea"
          value={codes}
          onChange={(e) => setCodes(e.target.value)}
          rows={8}
          placeholder={"Paste @U codes here, one per line:\n@Ugd_t@Fme...\n@UgzR8/2}T...\n@Uge(J0Fg..."}
          style={{ marginBottom: 10, fontSize: 11 }}
        />

        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <button
            type="button"
            disabled={working || serials.length === 0}
            onClick={handleInject}
            style={{
              flex: 1, padding: "12px 14px", borderRadius: 10,
              border: "1px solid var(--color-accent)",
              background: "rgba(var(--color-accent-rgb, 59,130,246), 0.12)",
              color: "var(--color-accent)", fontSize: 13, fontWeight: 700,
              cursor: working ? "wait" : "pointer",
              touchAction: "manipulation", opacity: working ? 0.5 : 1,
            }}
          >
            {working ? "Injecting..." : `Inject All (${serials.length})`}
          </button>
        </div>

        {injectedCount > 0 && (
          <button
            type="button"
            disabled={dropping}
            onClick={handleDrop}
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 10,
              border: "1px solid #22c55e",
              background: "rgba(34,197,94,0.12)",
              color: "#22c55e", fontSize: 13, fontWeight: 700,
              cursor: dropping ? "wait" : "pointer",
              touchAction: "manipulation", opacity: dropping ? 0.5 : 1,
              marginBottom: 10,
            }}
          >
            {dropping ? "Dropping..." : `Drop All (${injectedCount} items)`}
          </button>
        )}

        {status && (
          <p style={{
            fontSize: 12, textAlign: "center", marginTop: 6, lineHeight: 1.4,
            color: status.includes("!") ? "#4ade80" : status.includes("fail") || status.includes("not") ? "#f87171" : "#facc15",
          }}>
            {status}
          </p>
        )}
      </div>

      <div className="mobile-card" style={{ opacity: 0.7 }}>
        <div className="mobile-label">Quick Inject (Single Item)</div>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.4 }}>
          To inject a single item, use any builder and click the green "Inject to Game" button below the Base85 code.
        </p>
      </div>
    </div>
  );
}
