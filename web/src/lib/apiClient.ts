/**
 * Central API client for the web app.
 * - In dev: Vite proxies /api/* to backend; use path /api/save/decrypt etc.
 * - In prod with same host: same. With separate API host: set VITE_API_URL to e.g. https://api.example.com
 *   (no /api suffix); paths are then base + backend path (e.g. /save/decrypt).
 * - Staging: when VITE_STAGING_KEY is set, use fetchApi() so X-Staging-Key is sent; backend validates STAGING_KEY.
 */

function getImportMetaEnv(): Record<string, string | undefined> {
  try {
    // Vite-style env
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as any)?.env;
    return (env ?? {}) as Record<string, string | undefined>;
  } catch {
    return {};
  }
}

const API_BASE =
  (typeof import.meta !== "undefined" && getImportMetaEnv().VITE_API_URL) || "";

const STAGING_KEY_STORAGE = "bl4-staging-key";

/** Headers to add when staging is enabled (X-Staging-Key from session). */
export function getStagingHeader(): Record<string, string> {
  try {
    const env = getImportMetaEnv();
    if (typeof env.VITE_STAGING_KEY !== "string") return {};
    const k = sessionStorage.getItem(STAGING_KEY_STORAGE);
    if (k) return { "X-Staging-Key": k };
  } catch {}
  return {};
}

/** Backend path without leading slash, e.g. "save/decrypt", "parts/data". */
function normalizePath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

/**
 * Full URL for a backend path. Path is the backend path (e.g. "save/decrypt" or "/save/decrypt").
 * - If API_BASE is set: returns API_BASE + "/" + path.
 * - If API_BASE is empty (same origin): returns "/api/" + path so Vite proxy or same-origin backend can route.
 */
export function apiUrl(path: string): string {
  const p = normalizePath(path);
  if (API_BASE) return `${API_BASE.replace(/\/$/, "")}/${p}`;
  return `/api/${p}`;
}

/**
 * Fetch with apiUrl and default headers (Content-Type, optional X-Staging-Key for staging).
 * Use this for all API calls so staging key is sent when enabled.
 */
export function fetchApi(path: string, init: RequestInit = {}): Promise<Response> {
  const url = apiUrl(path);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getStagingHeader(),
    ...(init.headers as Record<string, string>),
  };
  return fetch(url, { ...init, headers });
}

/**
 * Fetch that uses apiUrl and returns JSON or throws on non-ok with a clear message.
 * For binary responses, use fetchApi(path, { method, body }) and handle blob/arrayBuffer.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const res = await fetchApi(path, options);
  return res;
}

/** Message when the backend is unreachable (network or 5xx). */
export const API_UNAVAILABLE_MSG =
  "Service unavailable. Check your connection and try again. If you self-host, ensure the API is running.";

export function isLikelyUnavailable(res: Response): boolean {
  // Treat only clear “backend is down” cases as unavailable:
  // - status 0: network error
  // - 502/503: upstream/proxy unavailable
  // 500-level app errors should surface their real message instead.
  return res.status === 0 || res.status === 502 || res.status === 503;
}

export function getApiUnavailableError(): string {
  return API_UNAVAILABLE_MSG;
}
