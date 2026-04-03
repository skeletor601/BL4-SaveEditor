/**
 * Injector Setup Modal — shows instructions and download link for BL4_Injector.exe.
 * User must scroll through and agree before downloading.
 * Used by both "Inject to Game" buttons and the Loot Lobby page.
 */

import { useState, useRef, useEffect } from "react";

const DOWNLOAD_URL = "/downloads/BL4_Injector.exe";

interface Props {
  mode: "inject" | "loot-lobby";
  onClose: () => void;
  onReady?: () => void;
}

export default function InjectorSetupModal({ mode, onClose, onReady }: Props) {
  const [hasScrolled, setHasScrolled] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleScroll = () => {
    const el = contentRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom) setHasScrolled(true);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border-2 border-[var(--color-panel-border)] bg-[rgba(14,16,20,0.98)] shadow-2xl flex flex-col"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--color-panel-border)] shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--color-accent)]">
              {mode === "inject" ? "Live Game Injection" : "Loot Lobby Setup"}
            </h2>
            <button type="button" onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] text-xl p-1">
              x
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div
          ref={contentRef}
          onScroll={handleScroll}
          className="px-5 py-4 overflow-y-auto flex-1 space-y-4 text-sm text-[var(--color-text)] leading-relaxed"
        >
          {/* What it does */}
          <section>
            <h3 className="text-[var(--color-accent)] font-bold mb-2 text-xs uppercase tracking-wider">
              What This Does
            </h3>
            {mode === "inject" ? (
              <p>
                The BL4 Live Injector lets you send items directly from bl4editor.com into your running Borderlands 4 game.
                Build an item in any builder, click "Inject to Game", and it appears in your inventory instantly — no save file editing needed.
              </p>
            ) : (
              <div className="space-y-2">
                <p>
                  The Loot Lobby feature lets you batch-inject hundreds of modded items into your backpack, then drop them all
                  on the ground for console players to pick up in co-op.
                </p>
                <p>This is a two-step process:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li><strong>Inject</strong> — paste @U codes, click Inject All, items go into your backpack</li>
                  <li><strong>Drop</strong> — open inventory, hover first new item, click Drop All</li>
                </ol>
              </div>
            )}
          </section>

          {/* Requirements */}
          <section>
            <h3 className="text-[var(--color-accent)] font-bold mb-2 text-xs uppercase tracking-wider">
              Requirements
            </h3>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Windows PC</strong> — the injector only works on Windows</li>
              <li><strong>Borderlands 4</strong> running and loaded into a character (not main menu)</li>
              <li><strong>BL4_Injector.exe</strong> running as <span className="text-yellow-400 font-bold">Administrator</span></li>
              <li>No Cheat Engine or other tools needed</li>
            </ul>
          </section>

          {/* Step by step */}
          <section>
            <h3 className="text-[var(--color-accent)] font-bold mb-2 text-xs uppercase tracking-wider">
              Step-by-Step Setup
            </h3>
            <div className="space-y-3">
              <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.3)] p-3">
                <p className="font-bold text-[var(--color-accent)] mb-1">Step 1: Download</p>
                <p>Download <code className="text-xs bg-white/10 px-1 rounded">BL4_Injector.exe</code> using the button below. Save it anywhere on your PC.</p>
              </div>
              <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.3)] p-3">
                <p className="font-bold text-[var(--color-accent)] mb-1">Step 2: Run as Administrator</p>
                <p>Right-click <code className="text-xs bg-white/10 px-1 rounded">BL4_Injector.exe</code> and select <strong>"Run as administrator"</strong>. This is required for memory access. You'll see a console window appear.</p>
              </div>
              <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.3)] p-3">
                <p className="font-bold text-[var(--color-accent)] mb-1">Step 3: Launch Borderlands 4</p>
                <p>Start the game and load into a character. The injector will auto-detect the game and find the memory addresses (~2 seconds).</p>
              </div>
              <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.3)] p-3">
                <p className="font-bold text-[var(--color-accent)] mb-1">Step 4: {mode === "inject" ? "Inject Items" : "Use Loot Lobby"}</p>
                {mode === "inject" ? (
                  <p>Come back to bl4editor.com, build any item, and click the green <strong>"Inject to Game"</strong> button. The item appears in your inventory instantly.</p>
                ) : (
                  <div className="space-y-1">
                    <p>Come back to bl4editor.com, go to <strong>Backpack &gt; Loot Lobby</strong>.</p>
                    <p>Paste your @U codes (one per line), click <strong>Inject All</strong>.</p>
                    <p>Then open your in-game inventory, hover the first new item, and click <strong>Drop All</strong>.</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Important notes */}
          <section>
            <h3 className="text-yellow-400 font-bold mb-2 text-xs uppercase tracking-wider">
              Important Notes
            </h3>
            <ul className="list-disc list-inside space-y-1 ml-2 text-[var(--color-text-muted)]">
              <li>The injector only reads/writes to the Borderlands 4 process — it does not modify game files on disk</li>
              <li>No data leaves your machine — the connection is localhost only (port 27015)</li>
              <li>Keep the injector running while you use bl4editor.com</li>
              <li>If the game restarts, restart the injector too</li>
              <li>After game updates, offsets may shift — check for an updated BL4_Injector.exe</li>
              {mode === "loot-lobby" && (
                <li className="text-yellow-400">The Drop feature uses keyboard simulation which can occasionally crash the game. Drop in smaller batches (10-20 items) for stability.</li>
              )}
              <li>Windows Defender may flag the .exe since it accesses another process's memory. This is a false positive — the code is open source</li>
            </ul>
          </section>

          {/* Scroll prompt */}
          {!hasScrolled && (
            <div className="text-center text-xs text-[var(--color-text-muted)] animate-pulse py-2">
              Scroll down to continue...
            </div>
          )}
        </div>

        {/* Footer with agree + download */}
        <div className="px-5 py-4 border-t border-[var(--color-panel-border)] shrink-0 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={!hasScrolled}
              className="mt-1 accent-[var(--color-accent)]"
            />
            <span className={`text-xs ${hasScrolled ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>
              I understand how the injector works, that it requires Administrator access, and that I use it at my own risk.
            </span>
          </label>

          <div className="flex gap-3">
            <a
              href={DOWNLOAD_URL}
              download="BL4_Injector.exe"
              onClick={(e) => {
                if (!agreed) {
                  e.preventDefault();
                  return;
                }
                // Mark as downloaded in localStorage
                localStorage.setItem("bl4-injector-setup-done", "1");
                onReady?.();
              }}
              className={`flex-1 text-center px-4 py-3 rounded-lg font-bold text-sm min-h-[44px] transition-all ${
                agreed
                  ? "bg-green-500/20 border border-green-500 text-green-400 hover:bg-green-500/30 cursor-pointer"
                  : "bg-white/5 border border-[var(--color-panel-border)] text-[var(--color-text-muted)] cursor-not-allowed opacity-50"
              }`}
            >
              Download BL4_Injector.exe
            </a>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] text-sm min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Check if user has already completed setup. */
export function hasCompletedInjectorSetup(): boolean {
  return localStorage.getItem("bl4-injector-setup-done") === "1";
}
