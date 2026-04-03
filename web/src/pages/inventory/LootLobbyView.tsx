/**
 * Loot Lobby — Batch inject items and drop them on the ground.
 * For PC hosts sharing modded items with console players in co-op.
 *
 * Requires BL4_Injector.exe running locally.
 */

import { useState } from "react";
import InjectorSetupModal, { hasCompletedInjectorSetup } from "@/components/InjectorSetupModal";

export default function LootLobbyView() {
  const [codes, setCodes] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [injectedCount, setInjectedCount] = useState(0);
  const [dropping, setDropping] = useState(false);
  const [dropCount, setDropCount] = useState(0);
  const [showSetup, setShowSetup] = useState(false);

  const serials = codes
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("@U"));

  const handleInject = async () => {
    if (serials.length === 0) {
      setStatus("Paste @U codes first (one per line)");
      return;
    }
    if (!hasCompletedInjectorSetup()) {
      setShowSetup(true);
      return;
    }
    setWorking(true);
    setStatus("Connecting to bridge...");
    try {
      const { batchInject } = await import("@/lib/injectorBridge");
      const resp = await batchInject(serials);
      if (resp.ok) {
        setInjectedCount(resp.injected ?? 0);
        setStatus(`Injected ${resp.injected} items into backpack! Open inventory and hover the first new item.`);
      } else {
        setStatus(resp.error ?? "Injection failed");
      }
    } catch {
      setStatus("Bridge not running. Start BL4_Injector.exe as Administrator.");
    }
    setWorking(false);
  };

  const handleDrop = async () => {
    if (injectedCount <= 0) {
      setStatus("Inject items first, then drop");
      return;
    }
    setDropping(true);
    setDropCount(0);
    setStatus(`Dropping ${injectedCount} items... Don't touch mouse/keyboard!`);
    try {
      const { dropAll } = await import("@/lib/injectorBridge");
      const resp = await dropAll(injectedCount);
      if (resp.ok) {
        setDropCount(resp.dropped ?? 0);
        setStatus(`Dropped ${resp.dropped} items on the ground!`);
        setInjectedCount(0);
      } else {
        setStatus(resp.error ?? "Drop failed — game may have crashed. Reduce batch size.");
      }
    } catch {
      setStatus("Bridge connection lost");
    }
    setDropping(false);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
        <h2 className="text-lg font-bold text-green-400 mb-1">Loot Lobby</h2>
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
          Batch inject modded items into your backpack, then drop them on the ground for console players to pick up.
          Requires <span className="text-green-400 font-medium">BL4_Injector.exe</span> running as Administrator.
        </p>
      </div>

      {/* Instructions */}
      <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] p-4 text-sm text-[var(--color-text-muted)] leading-relaxed space-y-1">
        <p className="text-[var(--color-text)] font-medium">How it works:</p>
        <p>1. Generate modded items in the builders, copy the Base85 (@U) codes</p>
        <p>2. Paste all codes below (one per line)</p>
        <p>3. Click <span className="text-[var(--color-accent)]">Inject All</span> — items go into your backpack</p>
        <p>4. Open inventory in-game, hover the first new item</p>
        <p>5. Click <span className="text-green-400">Drop All</span> — items fall on the ground</p>
        <p className="text-yellow-400/70 text-xs mt-2">Tip: Drop in smaller batches (10-20) to avoid crashes. The drop uses SendMessage which can be unstable in large batches.</p>
      </div>

      {/* Code input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm text-[var(--color-accent)] font-medium">
            @U Codes ({serials.length} items detected)
          </label>
          {serials.length > 0 && (
            <button
              type="button"
              onClick={() => setCodes("")}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Clear
            </button>
          )}
        </div>
        <textarea
          value={codes}
          onChange={(e) => setCodes(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-xs font-mono resize-y"
          placeholder={"Paste @U codes here, one per line:\n@Ugd_t@Fme...\n@UgzR8/2}T...\n@Uge(J0Fg..."}
        />
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={working || serials.length === 0}
          onClick={handleInject}
          className="px-6 py-3 rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 text-sm font-bold min-h-[44px] touch-manipulation disabled:opacity-40"
        >
          {working ? "Injecting..." : `Inject All (${serials.length} items)`}
        </button>

        {injectedCount > 0 && (
          <button
            type="button"
            disabled={dropping}
            onClick={handleDrop}
            className="px-6 py-3 rounded-lg border border-green-500 text-green-400 hover:bg-green-500/10 text-sm font-bold min-h-[44px] touch-manipulation disabled:opacity-40"
          >
            {dropping ? "Dropping..." : `Drop All (${injectedCount} items)`}
          </button>
        )}
      </div>

      {/* Status */}
      {status && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          status.includes("!") ? "border-green-500/30 bg-green-500/5 text-green-400" :
          status.includes("fail") || status.includes("not") || status.includes("crash") ? "border-red-500/30 bg-red-500/5 text-red-400" :
          "border-yellow-500/30 bg-yellow-500/5 text-yellow-400"
        }`}>
          {status}
        </div>
      )}

      {dropCount > 0 && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-400">
          {dropCount} items dropped on the ground! Console players can now pick them up.
        </div>
      )}

      {showSetup && (
        <InjectorSetupModal
          mode="loot-lobby"
          onClose={() => setShowSetup(false)}
          onReady={() => setShowSetup(false)}
        />
      )}
    </div>
  );
}
