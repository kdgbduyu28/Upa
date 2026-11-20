import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';

export type Async<T> = { data: T | undefined; error: Error | null; loading: boolean; reload: () => void };

/**
 * Runs `fn` whenever `deps` change and keeps the latest result. Results of
 * superseded calls are dropped, so fast typing never shows stale results.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    fn().then(
      (d) => {
        if (mine !== seq.current) return;
        setData(d);
        setError(null);
        setLoading(false);
      },
      (e: Error) => {
        if (mine !== seq.current) return;
        setError(e);
        setLoading(false);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

/** A value that settles `ms` after the last change (for search-as-you-type). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Layout breakpoints: phone < 720 ≤ tablet < 1024 ≤ desktop. */
export function useLayout() {
  const { width } = useWindowDimensions();
  return { width, wide: width >= 720, desktop: width >= 1024 };
}
