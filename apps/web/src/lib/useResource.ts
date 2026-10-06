import { useEffect, useState, useCallback } from 'react';
import { api, errorMessage } from './http';
export function useResource<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null),
    [status, setStatus] = useState<number | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setStatus(null);
    api
      .get<T>(url, { signal: controller.signal })
      .then((r) => {
        if (controller.signal.aborted) return;
        setData(r.data);
        setLoading(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setData(null);
          setStatus(e?.response?.status ?? null);
          setError(errorMessage(e));
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [url, version]);
  return { data, error, loading, reload, setData, status };
}
