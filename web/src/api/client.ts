const API_BASE = (import.meta.env.VITE_API_URL as string) || "";

export async function apiGet<T>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}
