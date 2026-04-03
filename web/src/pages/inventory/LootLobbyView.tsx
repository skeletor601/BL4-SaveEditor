/**
 * Loot Lobby — Drop all unequipped backpack items on the ground.
 * For PC hosts sharing modded items with console players in co-op.
 *
 * Flow: User fills backpack with modded items via save editor,
 * loads into co-op, clicks "Drop All", items fall on ground,
 * console players pick them up. Repeat.
 *
 * Requires BL4_Injector.exe running locally.
 */

import { useState } from "react";
import InjectorSetupModal, { hasCompletedInjectorSetup } from "@/components/InjectorSetupModal";

export default function LootLobbyView() {
  const [status, setStatus] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [dropCount, setDropCount] = useState<number | null>(null);
  const [itemCount, setItemCount] = useState(10);
  const [showSetup, setShowSetup] = useState(false);

  const handleDrop = async () => {
    if (!hasCompletedInjectorSetup()) {
      setShowSetup(true);
      return;
    }
    if (itemCount <= 0) {
      setStatus("Enter the number of items to drop");
      return;
    }
    setDropping(true);
    setDropCount(null);
    setStatus(`Dropping ${itemCount} items... Have inventory open, hover the first item!`);
    try {
      const { dropAll } = await import("@/lib/injectorBridge");
      const resp = await dropAll(itemCount);
      if (resp.ok) {
        setDropCount(resp.dropped ?? 0);
        setStatus(`Dropped ${resp.dropped} items on the ground!`);
      } else {
        setStatus(resp.error ?? "Drop failed");
      }
    } catch {
      setStatus("Bridge not running. Start BL4_Injector.exe as Administrator.");
    }
    setDropping(false);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
        <h2 className="text-lg font-bold text-green-400 mb-1">Loot Lobby</h2>
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
          Drop all your backpack items on the ground for console players to pick up.
          Requires <span className="text-green-400 font-medium">BL4_Injector.exe</span> running as Administrator.
        </p>
      </div>

      {/* Instructions */}
      <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] p-4 text-sm text-[var(--color-text-muted)] leading-relaxed space-y-1">
        <p className="text-[var(--color-text)] font-medium">How it works:</p>
        <p>1. Fill your backpack with modded items using the save editor</p>
        <p>2. Load into a co-op game with console players</p>
        <p>3. Open your inventory and hover over the <strong>first unequipped item</strong></p>
        <p>4. Click <span className="text-green-400">Drop All</span> below</p>
        <p>5. Items drop one by one (~2 sec each). Don't touch mouse/keyboard!</p>
        <p>6. Reload your save and repeat as needed</p>
        <p className="text-yellow-400/70 text-xs mt-2">Tip: Drop in batches of 10-20 for stability. The drop simulates holding R for each item.</p>
      </div>

      {/* Drop controls */}
      <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] p-4 space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-sm text-[var(--color-accent)] font-medium whitespace-nowrap">
            Items to drop:
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={itemCount}
            onChange={(e) => setItemCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
            className="w-20 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-center font-mono"
          />
          <span className="text-xs text-[var(--color-text-muted)]">
            ~{itemCount * 2} seconds
          </span>
        </div>

        <button
          type="button"
          disabled={dropping}
          onClick={handleDrop}
          className="w-full px-6 py-3 rounded-lg border border-green-500 text-green-400 hover:bg-green-500/10 text-sm font-bold min-h-[44px] touch-manipulation disabled:opacity-40"
        >
          {dropping ? "Dropping... don't touch anything!" : `Drop ${itemCount} Items`}
        </button>
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

      {dropCount != null && dropCount > 0 && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-400">
          {dropCount} items dropped! Console players can now pick them up. Reload your save and repeat.
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
