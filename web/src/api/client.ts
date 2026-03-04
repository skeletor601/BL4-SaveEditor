function getImportMetaEnv(): Record<string, string | undefined> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as any)?.env as Record<string, string | undefined> | undefined;
    return env ?? {};
  } catch {
    return {};
  }
}

const API_BASE = (getImportMetaEnv().VITE_API_URL as string) || "";

export async function apiGet<T>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}
