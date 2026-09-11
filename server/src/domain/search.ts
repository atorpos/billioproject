import type { Listing, RankedListing, SearchParams, SearchResponse } from '@billio/shared';
import { dedupeListings, listingKey } from './dedupe.js';
import { filterListings } from './filter.js';
import { planPagination } from './paginate.js';
import { scoreListing, type ScoringWeights } from './score.js';

export interface SearchOptions {
  /** Injected clock. Keeps scoring deterministic in tests. */
  now?: Date;
  weights?: ScoringWeights;
}

/**
 * Orders results by relevance, with fully deterministic tiebreaks.
 *
 * Ties are common (scores are rounded to 2dp, and the sample feeds carry near
 * identical properties), so leaving the order to the sort's input ordering would
 * make pagination unstable: the same listing could appear on page 1 and page 2
 * across two requests. Breaking ties on listedDate and then on the stable
 * `source:id` key guarantees a total order.
 */
export function compareRanked(a: RankedListing, b: RankedListing): number {
  if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;

  const aDate = Date.parse(a.listedDate);
  const bDate = Date.parse(b.listedDate);
  const aValid = !Number.isNaN(aDate);
  const bValid = !Number.isNaN(bDate);
  if (aValid && bValid && aDate !== bDate) return bDate - aDate;
  if (aValid !== bValid) return aValid ? -1 : 1;

  return a.listingKey.localeCompare(b.listingKey);
}

/**
 * The full pipeline: dedupe -> filter -> score -> sort -> paginate.
 *
 * Deduping runs *first* so filters and the total count apply to distinct
 * properties. Deduping after filtering would let a price filter drop the copy we
 * would have kept and leave the copy we would have discarded.
 */
export function searchListings(
  listings: readonly Listing[],
  params: SearchParams,
  options: SearchOptions = {},
): SearchResponse {
  const now = options.now ?? new Date();

  const { listings: candidates, duplicates, collapsedCount } = params.dedupe
    ? dedupeListings(listings)
    : { listings: [...listings], duplicates: new Map(), collapsedCount: 0 };

  const matched = filterListings(candidates, params);

  const ranked: RankedListing[] = matched.map((listing) => {
    const key = listingKey(listing);
    const { score, breakdown } = scoreListing(listing, {
      targetBudget: params.targetBudget,
      keyword: params.keyword,
      now,
      weights: options.weights,
    });
    return {
      ...listing,
      listingKey: key,
      relevanceScore: score,
      breakdown,
      duplicates: duplicates.get(key) ?? [],
    };
  });

  ranked.sort(compareRanked);

  const { start, end, meta } = planPagination({
    page: params.page,
    pageSize: params.pageSize,
    totalItems: ranked.length,
  });

  return {
    items: ranked.slice(start, end),
    meta: { ...meta, duplicatesCollapsed: collapsedCount },
    appliedParams: params,
  };
}
