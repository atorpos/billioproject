import type { Listing, SearchParams } from '@billio/shared';
import { normaliseCity, normaliseText, toTerms } from './text.js';

/**
 * Filtering is a hard gate: a listing either qualifies for the result set or it
 * does not. Ranking (see score.ts) then orders what survives. Keeping the two
 * separate means a loose filter never silently reorders results, and a strict
 * filter never hides a listing just because it scored poorly.
 */

/** City matching is exact-after-normalisation, so "Vienna" and " vienna " agree. */
export function matchesCity(listing: Listing, city: string): boolean {
  return normaliseCity(listing.city) === normaliseCity(city);
}

/**
 * Keyword matching uses OR semantics: a listing qualifies if it matches *any* of
 * the terms, in the description or the address/city. AND semantics would return
 * nothing for a perfectly reasonable query like "pet friendly garage", so instead
 * we let everything plausible through the gate and let the keyword component of
 * the relevance score push the listings matching more terms to the top.
 */
export function matchesKeyword(listing: Listing, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = normaliseText(
    `${listing.description} ${listing.address} ${listing.city} ${listing.state} ${listing.zip}`,
  );
  return terms.some((term) => haystack.includes(term));
}

export function matchesFilters(listing: Listing, params: SearchParams, terms: string[]): boolean {
  if (params.minPrice !== null && listing.price < params.minPrice) return false;
  if (params.maxPrice !== null && listing.price > params.maxPrice) return false;
  if (params.minBedrooms !== null && listing.bedrooms < params.minBedrooms) return false;
  if (params.city !== null && !matchesCity(listing, params.city)) return false;
  if (params.status !== null && listing.status !== params.status) return false;
  if (!matchesKeyword(listing, terms)) return false;
  return true;
}

/** Applies every active filter. Returns a new array; the input is never mutated. */
export function filterListings(listings: readonly Listing[], params: SearchParams): Listing[] {
  const terms = params.keyword ? toTerms(params.keyword) : [];
  return listings.filter((listing) => matchesFilters(listing, params, terms));
}
