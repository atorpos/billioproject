import type { Listing, SearchParams } from '@billio/shared';
import { DEFAULT_SEARCH_PARAMS } from '@billio/shared';

let sequence = 0;

/** Builds a valid listing, overriding only the fields a test cares about. */
export function makeListing(overrides: Partial<Listing> = {}): Listing {
  sequence += 1;
  return {
    id: `L${sequence}`,
    source: 'MLS_TEST',
    address: `${sequence} Test St`,
    city: 'Springfield',
    state: 'VA',
    zip: '22150',
    price: 500_000,
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1500,
    latitude: 38.78,
    longitude: -77.18,
    listedDate: '2026-09-01',
    status: 'active',
    description: 'A pleasant home.',
    ...overrides,
  };
}

export function makeParams(overrides: Partial<SearchParams> = {}): SearchParams {
  return { ...DEFAULT_SEARCH_PARAMS, ...overrides };
}

/** Fixed clock so every recency-dependent assertion is deterministic. */
export const NOW = new Date('2026-09-11T00:00:00.000Z');
