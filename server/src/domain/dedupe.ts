import type { DuplicateRef, Listing } from '@billio/shared';
import { normaliseAddress, normaliseCity } from './text.js';

/**
 * The same property is frequently carried by more than one MLS feed, with small
 * differences in address formatting, price and even ZIP. Showing both copies wastes
 * a result slot and makes pagination counts misleading, so near-duplicates are
 * collapsed into one record before filtering and ranking.
 *
 * A cheap deterministic key does the grouping — no fuzzy string distance, which
 * would be slower and much harder to reason about in tests:
 *
 *   normalised address + city + state + bedrooms + sqft bucket
 *
 * ZIP is deliberately excluded because the sample data proves feeds disagree on it.
 * A coordinate check then guards against key collisions between genuinely different
 * properties that happen to share a street address string.
 */

/** sqft is bucketed so 1450 and 1455 from two feeds still group together. */
const SQFT_BUCKET = 25;

/** ~0.003 degrees is roughly 300m — well inside "same building", well outside "same street". */
const MAX_COORDINATE_DELTA = 0.003;

export function duplicateKey(listing: Listing): string {
  return [
    normaliseAddress(listing.address),
    normaliseCity(listing.city),
    listing.state.trim().toUpperCase(),
    listing.bedrooms,
    Math.round(listing.sqft / SQFT_BUCKET),
  ].join('|');
}

function isNearby(a: Listing, b: Listing): boolean {
  if (![a.latitude, a.longitude, b.latitude, b.longitude].every(Number.isFinite)) {
    // Missing coordinates: fall back to trusting the address key alone.
    return true;
  }
  return (
    Math.abs(a.latitude - b.latitude) <= MAX_COORDINATE_DELTA &&
    Math.abs(a.longitude - b.longitude) <= MAX_COORDINATE_DELTA
  );
}

export function listingKey(listing: Listing): string {
  return `${listing.source}:${listing.id}`;
}

function toDuplicateRef(listing: Listing): DuplicateRef {
  return {
    listingKey: listingKey(listing),
    id: listing.id,
    source: listing.source,
    price: listing.price,
    listedDate: listing.listedDate,
  };
}

/**
 * Of a duplicate group, the listing shown is the one that best serves the buyer:
 * lowest price wins, then the most recently listed, then a stable id tiebreak so
 * the output never depends on input ordering.
 */
export function pickPrimary(group: readonly Listing[]): Listing {
  return [...group].sort((a, b) => {
    if (a.price !== b.price) return a.price - b.price;
    const dateDelta = Date.parse(b.listedDate) - Date.parse(a.listedDate);
    if (!Number.isNaN(dateDelta) && dateDelta !== 0) return dateDelta;
    return listingKey(a).localeCompare(listingKey(b));
  })[0]!;
}

export interface DedupeResult {
  listings: Listing[];
  /** Map from the surviving listing's key to the listings it absorbed. */
  duplicates: Map<string, DuplicateRef[]>;
  collapsedCount: number;
}

export function dedupeListings(listings: readonly Listing[]): DedupeResult {
  const groups = new Map<string, Listing[]>();

  for (const listing of listings) {
    const key = duplicateKey(listing);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, [listing]);
      continue;
    }
    // Guard against two different properties colliding on the same key.
    if (group.some((member) => isNearby(member, listing))) {
      group.push(listing);
    } else {
      groups.set(`${key}#${listingKey(listing)}`, [listing]);
    }
  }

  const result: Listing[] = [];
  const duplicates = new Map<string, DuplicateRef[]>();
  let collapsedCount = 0;

  for (const group of groups.values()) {
    const primary = pickPrimary(group);
    result.push(primary);

    const others = group.filter((listing) => listing !== primary);
    if (others.length > 0) {
      duplicates.set(listingKey(primary), others.map(toDuplicateRef));
      collapsedCount += others.length;
    }
  }

  return { listings: result, duplicates, collapsedCount };
}
