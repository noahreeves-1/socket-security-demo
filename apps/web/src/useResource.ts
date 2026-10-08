import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useResource<T>(fetcher: (signal: AbortSignal) => Promise<T>): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    void fetcher(controller.signal).then((result) => {
      if (!controller.signal.aborted && current === generation.current) setData(result);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted && current === generation.current) setError(errorMessage(failure));
    }).finally(() => {
      if (!controller.signal.aborted && current === generation.current) setLoading(false);
    });
    return () => controller.abort();
  }, [fetcher, revision]);

  return { data, loading, error, refresh };
}
