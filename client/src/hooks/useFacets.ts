import { useEffect, useState } from 'react';
import type { FacetsResponse } from '@billio/shared';
import { fetchFacets } from '../api/client.js';

/**
 * Loads the facet data that powers real, data-driven inputs (the city select, the
 * price placeholders). Failure is non-fatal: the UI degrades to a free-text city
 * box rather than blocking search entirely.
 */
export function useFacets(): { facets: FacetsResponse | null; failed: boolean } {
  const [facets, setFacets] = useState<FacetsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetchFacets(controller.signal)
      .then(setFacets)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });

    return () => controller.abort();
  }, []);

  return { facets, failed };
}
