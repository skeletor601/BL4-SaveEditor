import { useCallback, useState } from "react";
import { fetchApi, getApiUnavailableError, isLikelyUnavailable } from "@/lib/apiClient";
import { usePersistedState } from "@/lib/usePersistedState";

export default function DecoderView() {
  const [base85Input, setBase85Input] = usePersistedState("decoder.base85Input", "");
  const [decodedInput, setDecodedInput] = usePersistedState("decoder.decodedInput", "");
  const [loading, setLoading] = useState<"decode" | "encode" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const decodeBase85 = useCallback(async () => {
    const serials = base85Input
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!serials.length) {
      setMessage("Paste Base85 code first.");
      return;
    }
    setLoading("decode");
    setMessage(null);
    try {
      const res = await fetchApi("save/decode-items", {
        method: "POST",
        body: JSON.stringify({ serials }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(isLikelyUnavailable(res) ? getApiUnavailableError() : (data?.error ?? "Decode failed"));
        return;
      }
      const items = Array.isArray(data?.items) ? data.items : [];
      const lines = items.map((item: { decodedFull?: string; error?: string }, idx: number) => {
        if (item?.error) return `# Line ${idx + 1} error: ${item.error}`;
        return String(item?.decodedFull ?? "").trim();
      });
      setDecodedInput(lines.join("\n"));
      setMessage(`Decoded ${items.length} code${items.length === 1 ? "" : "s"}.`);
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [base85Input]);

  const encodeDecoded = useCallback(async () => {
    const decodedLines = decodedInput
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!decodedLines.length) {
      setMessage("Paste deserialized code first.");
      return;
    }
    setLoading("encode");
    setMessage(null);
    try {
      const out: string[] = [];
      for (let i = 0; i < decodedLines.length; i += 1) {
        const decoded = decodedLines[i];
        const res = await fetchApi("save/encode-serial", {
          method: "POST",
          body: JSON.stringify({ decoded_string: decoded }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          out.push(`# Line ${i + 1} error: ${isLikelyUnavailable(res) ? getApiUnavailableError() : (data?.error ?? "Encode failed")}`);
          continue;
        }
        if (data?.success && typeof data?.serial === "string") out.push(data.serial);
        else out.push(`# Line ${i + 1} error: ${data?.error ?? "Encode failed"}`);
      }
      setBase85Input(out.join("\n"));
      setMessage(`Encoded ${decodedLines.length} code${decodedLines.length === 1 ? "" : "s"}.`);
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [decodedInput]);

  const autoConvert = useCallback(async () => {
    const b = base85Input.trim();
    const d = decodedInput.trim();
    if (!b && !d) {
      setMessage("Paste code in either box first.");
      return;
    }
    if (b && !d) {
      await decodeBase85();
      return;
    }
    if (d && !b) {
      await encodeDecoded();
      return;
    }
    const bFirst = b.split(/\r?\n/, 1)[0].trim();
    if (bFirst.startsWith("@")) {
      await decodeBase85();
      return;
    }
    await encodeDecoded();
  }, [base85Input, decodedInput, decodeBase85, encodeDecoded]);

  const copyText = useCallback(async (value: string) => {
    if (!value.trim()) {
      setMessage("Nothing to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied to clipboard.");
    } catch {
      setMessage("Copy failed. Select text and copy manually.");
    }
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-accent)]">Decoder</h2>
      <p className="text-sm text-[var(--color-text-muted)]">
        Paste Base85 or deserialized code in either box, then convert to the other format.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[var(--color-text-muted)]">Base85</label>
          <textarea
            value={base85Input}
            onChange={(e) => setBase85Input(e.target.value)}
            placeholder="@U..."
            spellCheck={false}
            className="w-full min-h-[260px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] px-3 py-2 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => copyText(base85Input)}
            className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-sm hover:bg-[var(--color-panel-border)]"
          >
            Copy Base85
          </button>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-[var(--color-text-muted)]">Deserialized</label>
          <textarea
            value={decodedInput}
            onChange={(e) => setDecodedInput(e.target.value)}
            placeholder="255, 0, 1, 50| 2, 1234|| {12} {1:7} ..."
            spellCheck={false}
            className="w-full min-h-[260px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] px-3 py-2 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => copyText(decodedInput)}
            className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-sm hover:bg-[var(--color-panel-border)]"
          >
            Copy Deserialized
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={autoConvert}
          disabled={loading !== null}
          className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Converting..." : "Convert"}
        </button>
        <button
          type="button"
          onClick={decodeBase85}
          disabled={loading !== null}
          className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-sm hover:bg-[var(--color-panel-border)] disabled:opacity-50"
        >
          Base85 → Deserialized
        </button>
        <button
          type="button"
          onClick={encodeDecoded}
          disabled={loading !== null}
          className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-sm hover:bg-[var(--color-panel-border)] disabled:opacity-50"
        >
          Deserialized → Base85
        </button>
        <button
          type="button"
          onClick={() => {
            setBase85Input("");
            setDecodedInput("");
            setMessage(null);
          }}
          className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-sm hover:bg-[var(--color-panel-border)]"
        >
          Clear
        </button>
      </div>

      {message && (
        <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] px-3 py-2 text-sm text-[var(--color-text)]">
          {message}
        </div>
      )}
    </div>
  );
}
