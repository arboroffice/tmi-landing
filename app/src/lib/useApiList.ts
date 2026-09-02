import { useEffect, useState } from 'react';
import { api } from './api';

// Load a list endpoint. Returns { data, loading, error }. Reloads when the
// endpoint changes.
export function useApiList<T = unknown>(endpoint: string) {
  const [data, setData] = useState<T[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setData(null); setError('');
    api.get<T[]>(endpoint)
      .then((r) => { if (live) setData(Array.isArray(r) ? r : []); })
      .catch((e) => { if (live) setError(e.message || 'Failed to load'); });
    return () => { live = false; };
  }, [endpoint]);
  return { data, error, loading: data === null && !error };
}
