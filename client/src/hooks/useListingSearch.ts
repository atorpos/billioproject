import { useCallback, useEffect, useRef, useState } from 'react';
import type { SearchParams, SearchResponse } from '@billio/shared';
import { toQueryString } from '@billio/shared';
import { ApiRequestError, searchListings } from '../api/client.js';

export type RequestStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseListingSearchResult {
  data: SearchResponse | null;
  status: RequestStatus;
  error: ApiRequestError | null;
  /** True while a request is in flight, including refreshes over existing data. */
  isFetching: boolean;
  retry: () => void;
}

/**
 * Runs a search whenever the validated params change.
 *
 * - In-flight requests are aborted when params change, so a slow early response can
 *   never overwrite a fast later one.
 * - The previous page of results stays on screen while the next loads, which avoids
 *   the list collapsing and re-expanding on every keystroke.
 * - `params === null` means the form is invalid; the hook then makes no request and
 *   simply stops, leaving the inline field errors to explain why.
 */
export function useListingSearch(params: SearchParams | null): UseListingSearchResult {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [status, setStatus] = useState<RequestStatus>('idle');
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Serialising the params gives a stable dependency; the object identity changes
  // on every render but the query rarely does.
  const queryKey = params ? toQueryString(params) : null;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    const current = paramsRef.current;
    if (!current) {
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setStatus('loading');
    setError(null);

    searchListings(current, controller.signal)
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setStatus('success');
      })
      .catch((cause: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setError(
          cause instanceof ApiRequestError
            ? cause
            : new ApiRequestError('Unexpected error while searching listings.', 0, 'UNKNOWN'),
        );
        setStatus('error');
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [queryKey, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    data,
    status,
    error,
    isFetching: status === 'loading',
    retry,
  };
}
