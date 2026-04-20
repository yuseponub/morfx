/**
 * useMessageSearch — debounced mobile search against /api/mobile/search.
 *
 * Phase 43 Plan 12.
 *
 * Behaviour:
 *   - `query` is a local state string the SearchBar updates on every
 *     keystroke. The hook schedules a debounced (300ms) API fetch so we do
 *     not hit the endpoint on every character typed.
 *   - Queries shorter than 2 characters clear the result list without
 *     firing a request (the endpoint rejects those with 400 anyway).
 *   - Results are EPHEMERAL — never written to sqlite. A user's search
 *     session lasts seconds; persisting the result set would stale fast
 *     and the storage cost is not justified for what is effectively a
 *     single round-trip. The inbox cache in Plan 07 remains the durable
 *     offline path.
 *   - `clear()` resets query + results without firing a request — used by
 *     the SearchBar's "X" affordance.
 *
 * Race safety:
 *   - Each fetch carries an incrementing `requestId`. When a response
 *     arrives we only apply it if its id is the newest issued — prevents
 *     a slow response from an old query overwriting a newer one.
 *   - Debounce timer is cleared on unmount.
 *
 * Error handling:
 *   - Network/API errors surface as `error` and leave `results` empty.
 *   - The error message is translated where possible (i18n is done by the
 *     caller; this hook keeps raw strings).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { mobileApi, MobileApiError } from '@/lib/api-client';
import {
  MobileSearchResponseSchema,
  type MobileSearchResult,
} from '@/lib/api-schemas/search';
import { useWorkspace } from '@/lib/workspace/use-workspace';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;

export interface UseMessageSearchResult {
  query: string;
  setQuery: (q: string) => void;
  results: MobileSearchResult[];
  loading: boolean;
  error: string | null;
  clear: () => void;
  /** True once the debounce fired and a fetch has been attempted for the
   *  current query. Used by the UI to distinguish "initial empty" from
   *  "no results" (avoids flashing "no results" during typing). */
  hasQueried: boolean;
}

export function useMessageSearch(): UseMessageSearchResult {
  const workspace = useWorkspace();
  const workspaceId = workspace?.workspaceId ?? null;

  const [query, setQueryState] = useState<string>('');
  const [results, setResults] = useState<MobileSearchResult[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasQueried, setHasQueried] = useState<boolean>(false);

  const requestCounter = useRef<number>(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runFetch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < MIN_QUERY_LEN) {
        // Reset cleanly without firing a request.
        setResults([]);
        setLoading(false);
        setError(null);
        setHasQueried(false);
        return;
      }

      const myRequestId = ++requestCounter.current;
      setLoading(true);
      setError(null);

      try {
        const raw = await mobileApi.get<unknown>(
          `/api/mobile/search?q=${encodeURIComponent(trimmed)}`
        );
        if (myRequestId !== requestCounter.current) return; // stale
        const parsed = MobileSearchResponseSchema.parse(raw);
        setResults(parsed.results);
        setHasQueried(true);
      } catch (err: unknown) {
        if (myRequestId !== requestCounter.current) return; // stale
        const message =
          err instanceof MobileApiError
            ? `API ${err.status}`
            : err instanceof Error
              ? err.message
              : String(err);
        setError(message);
        setResults([]);
        setHasQueried(true);
      } finally {
        if (myRequestId === requestCounter.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q);

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }

      const trimmed = q.trim();
      if (trimmed.length < MIN_QUERY_LEN) {
        // Clear immediately — no reason to wait for debounce to settle.
        setResults([]);
        setError(null);
        setLoading(false);
        setHasQueried(false);
        requestCounter.current++; // cancel any in-flight fetch
        return;
      }

      if (!workspaceId) return;

      debounceTimer.current = setTimeout(() => {
        void runFetch(trimmed);
      }, DEBOUNCE_MS);
    },
    [workspaceId, runFetch]
  );

  const clear = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    requestCounter.current++; // cancel any in-flight fetch
    setQueryState('');
    setResults([]);
    setLoading(false);
    setError(null);
    setHasQueried(false);
  }, []);

  // Cleanup on unmount: clear any pending debounce timer.
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, []);

  // If workspace changes mid-search, reset the hook — matches Plan 06
  // behaviour where (tabs) remounts but defence-in-depth doesn't hurt.
  useEffect(() => {
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return { query, setQuery, results, loading, error, clear, hasQueried };
}
