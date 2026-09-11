import type { ApiErrorBody, FacetsResponse, FieldIssue, SearchParams, SearchResponse } from '@billio/shared';
import { toQueryString } from '@billio/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

/** A failure the API described. Carries the per-field issues so the UI can show them. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly issues: FieldIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.message === 'string'
  );
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    // Re-throw aborts untouched so callers can ignore superseded requests.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiRequestError(
      'Could not reach the listings service. Check that the API is running and try again.',
      0,
      'NETWORK_ERROR',
    );
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isApiErrorBody(payload)) {
      throw new ApiRequestError(
        payload.error.message,
        response.status,
        payload.error.code,
        payload.error.issues ?? [],
      );
    }
    throw new ApiRequestError(
      `The listings service responded with ${response.status}.`,
      response.status,
      'UNEXPECTED_RESPONSE',
    );
  }

  return payload as T;
}

export function searchListings(params: SearchParams, signal?: AbortSignal): Promise<SearchResponse> {
  return request<SearchResponse>(`/listings/search?${toQueryString(params)}`, signal);
}

export function fetchFacets(signal?: AbortSignal): Promise<FacetsResponse> {
  return request<FacetsResponse>('/listings/facets', signal);
}
