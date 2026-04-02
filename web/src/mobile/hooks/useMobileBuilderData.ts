import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/apiClient";

const cache = new Map<string, unknown>();

/** Fetch and cache builder data from an API endpoint. */
export function useMobileBuilderData<T>(endpoint: string): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(() => (cache.get(endpoint) as T) ?? null);
  const [loading, setLoading] = useState(!cache.has(endpoint));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache.has(endpoint)) {
      setData(cache.get(endpoint) as T);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchApi(endpoint)
      .then((r) => r.json())
      .then((d: T) => {
        if (cancelled) return;
        cache.set(endpoint, d);
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [endpoint]);

  return { data, loading, error };
}
