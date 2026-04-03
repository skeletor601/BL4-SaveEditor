/**
 * WebSocket client for the BL4 Live Injector Bridge.
 * Connects to the local Python bridge (ws://localhost:27015)
 * which attaches to the running game and injects items.
 */

const BRIDGE_URL = "ws://localhost:27015";
const RECONNECT_DELAY = 5000;

type BridgeStatus = "disconnected" | "connecting" | "connected" | "game_attached";
type Listener = (status: BridgeStatus, detail?: string) => void;

let ws: WebSocket | null = null;
// Use string to avoid TS narrowing issues in async callbacks
let status = "disconnected" as BridgeStatus;
let gengine: string | null = null;
let listeners: Listener[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pendingResolvers: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map();
let msgId = 0;

function notify() {
  for (const fn of listeners) fn(status, gengine ?? undefined);
}

function send(action: string, extra: Record<string, unknown> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("Bridge not connected"));
      return;
    }
    const id = String(++msgId);
    pendingResolvers.set(id, { resolve, reject });
    ws.send(JSON.stringify({ action, _id: id, ...extra }));
    setTimeout(() => {
      if (pendingResolvers.has(id)) {
        pendingResolvers.delete(id);
        reject(new Error("Bridge timeout"));
      }
    }, 30000);
  });
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  status = "connecting";
  notify();

  try {
    ws = new WebSocket(BRIDGE_URL);
  } catch {
    status = "disconnected";
    notify();
    scheduleReconnect();
    return;
  }

  ws.onopen = async () => {
    status = "connected";
    notify();
    // Auto-attach to game
    try {
      const resp = await send("attach") as { ok: boolean; gengine?: string; error?: string };
      if (resp.ok) {
        gengine = resp.gengine ?? null;
        status = "game_attached";
        notify();
      }
    } catch { /* ignore */ }
  };

  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      // Route to pending resolver if has _id
      if (data._id && pendingResolvers.has(data._id)) {
        const { resolve } = pendingResolvers.get(data._id)!;
        pendingResolvers.delete(data._id);
        resolve(data);
        return;
      }
      // Otherwise resolve oldest pending
      if (pendingResolvers.size > 0) {
        const iter = pendingResolvers.entries().next();
        if (!iter.done) {
          const [firstId, { resolve }] = iter.value;
          pendingResolvers.delete(firstId);
          resolve(data);
        }
      }
    } catch { /* ignore */ }
  };

  ws.onclose = () => {
    ws = null;
    status = "disconnected";
    gengine = null;
    notify();
    // Reject all pending
    for (const [, { reject }] of pendingResolvers) reject(new Error("Bridge disconnected"));
    pendingResolvers.clear();
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY);
}

// ── Public API ──────────────────────────────────────────────────────────────

export function bridgeConnect() {
  connect();
}

export function bridgeDisconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  ws?.close();
  ws = null;
  status = "disconnected";
  gengine = null;
  notify();
}

export function getBridgeStatus(): BridgeStatus {
  return status;
}

export function onBridgeStatus(fn: Listener): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter((l) => l !== fn); };
}

export async function injectItem(serial: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  if ((status as string) !== "game_attached") {
    // Try connecting first
    connect();
    await new Promise((r) => setTimeout(r, 2000));
    if ((status as string) !== "game_attached") {
      return { ok: false, error: "Bridge not connected to game. Is bl4_bridge.py running?" };
    }
  }
  try {
    const resp = await send("inject", { serial }) as { ok: boolean; message?: string; error?: string };
    return resp;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function readBackpack(): Promise<{ ok: boolean; items?: unknown[]; error?: string }> {
  if ((status as string) !== "game_attached") {
    return { ok: false, error: "Not connected to game" };
  }
  try {
    return await send("read_backpack") as { ok: boolean; items?: unknown[]; error?: string };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function dropAll(count: number): Promise<{ ok: boolean; dropped?: number; error?: string }> {
  if ((status as string) !== "game_attached") {
    connect();
    await new Promise((r) => setTimeout(r, 2000));
    if ((status as string) !== "game_attached") {
      return { ok: false, error: "Bridge not connected to game. Is BL4_Injector.exe running?" };
    }
  }
  try {
    return await send("drop_all", { count }) as { ok: boolean; dropped?: number; error?: string };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function batchInject(serials: string[]): Promise<{ ok: boolean; injected?: number; error?: string }> {
  if ((status as string) !== "game_attached") {
    connect();
    await new Promise((r) => setTimeout(r, 2000));
    if ((status as string) !== "game_attached") {
      return { ok: false, error: "Bridge not connected to game. Is BL4_Injector.exe running?" };
    }
  }
  try {
    return await send("batch_inject", { serials }) as { ok: boolean; injected?: number; error?: string };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
