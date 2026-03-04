/**
 * Shown when VITE_STAGING_KEY is set and the user has not entered the correct key.
 * Supports ?key=xxx in URL to unlock without typing. Session-only (sessionStorage).
 */
import { useEffect, useState } from "react";

const STAGING_KEY_STORAGE = "bl4-staging-key";

export function useStagingUnlocked(): boolean {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const envKey = (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const env = (import.meta as any)?.env as Record<string, string | undefined> | undefined;
        return env?.VITE_STAGING_KEY;
      } catch {
        return undefined;
      }
    })();
    const expected = typeof envKey === "string" ? envKey : undefined;
    if (typeof expected !== "string" || !expected.trim()) {
      setUnlocked(true);
      return;
    }
    try {
      const stored = sessionStorage.getItem(STAGING_KEY_STORAGE);
      setUnlocked(stored === expected);
    } catch {
      setUnlocked(false);
    }
  }, []);

  return unlocked;
}

export function setStagingUnlocked(key: string): void {
  try {
    sessionStorage.setItem(STAGING_KEY_STORAGE, key);
  } catch {}
}

export function isStagingEnabled(): boolean {
  const envKey = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const env = (import.meta as any)?.env as Record<string, string | undefined> | undefined;
      return env?.VITE_STAGING_KEY;
    } catch {
      return undefined;
    }
  })();
  return typeof envKey === "string" && envKey.trim() !== "";
}

interface StagingGateProps {
  children: React.ReactNode;
}

export default function StagingGate({ children }: StagingGateProps) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const envKey = (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const env = (import.meta as any)?.env as Record<string, string | undefined> | undefined;
        return env?.VITE_STAGING_KEY;
      } catch {
        return undefined;
      }
    })();
    const expected = typeof envKey === "string" ? envKey : undefined;
    if (typeof expected !== "string" || !expected.trim()) {
      setUnlocked(true);
      return;
    }
    // Support ?key=xxx in URL
    const params = new URLSearchParams(window.location.search);
    const urlKey = params.get("key");
    if (urlKey !== null && urlKey === expected) {
      setStagingUnlocked(urlKey);
      setUnlocked(true);
      return;
    }
    try {
      const stored = sessionStorage.getItem(STAGING_KEY_STORAGE);
      setUnlocked(stored === expected);
    } catch {
      setUnlocked(false);
    }
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const envKey = (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const env = (import.meta as any)?.env as Record<string, string | undefined> | undefined;
        return env?.VITE_STAGING_KEY;
      } catch {
        return undefined;
      }
    })();
    const expected = typeof envKey === "string" ? envKey : undefined;
    if (typeof expected !== "string") {
      setUnlocked(true);
      return;
    }
    if (input.trim() === expected) {
      setStagingUnlocked(input.trim());
      setUnlocked(true);
    } else {
      setError("Invalid key.");
    }
  };

  if (unlocked === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] text-[var(--color-text)]">
        <p>Loading…</p>
      </div>
    );
  }

  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-bg)] text-[var(--color-text)] p-4">
      <div className="max-w-sm w-full border border-[var(--color-panel-border)] rounded-lg p-6 bg-[rgba(24,28,34,0.8)]">
        <h1 className="text-lg font-semibold text-[var(--color-accent)] mb-2">Staging access</h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          Enter the access key to use this staging build.
        </p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Access key"
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            className="px-4 py-2 rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)]"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
