import { describe, expect, it } from 'vitest';
import { compareRanked } from '../src/domain/search.js';
import { searchListings } from '../src/domain/search.js';
import type { RankedListing } from '@billio/shared';
import { makeListing, makeParams, NOW } from './fixtures.js';

const options = { now: NOW };

describe('searchListings pipeline', () => {
  const corpus = [
    makeListing({ id: 'A', price: 400_000, bedrooms: 2, city: 'Fairfax', listedDate: '2026-09-10', address: '1 A St' }),
    makeListing({ id: 'B', price: 500_000, bedrooms: 3, city: 'Vienna', listedDate: '2026-09-05', address: '2 B St' }),
    makeListing({ id: 'C', price: 600_000, bedrooms: 4, city: 'Reston', listedDate: '2026-08-01', address: '3 C St' }),
    makeListing({ id: 'D', price: 700_000, bedrooms: 5, city: 'Reston', listedDate: '2026-07-01', address: '4 D St' }),
  ];

  it('returns every listing ranked when no filters are applied', () => {
    const result = searchListings(corpus, makeParams({ pageSize: 10 }), options);
    expect(result.meta.totalItems).toBe(4);
    expect(result.items).toHaveLength(4);
  });

  it('sorts by relevance descending', () => {
    const result = searchListings(corpus, makeParams({ targetBudget: 500_000, pageSize: 10 }), options);
    const scores = result.items.map((item) => item.relevanceScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(result.items[0]?.id).toBe('B');
  });

  it('reports the total before pagination, not the page length', () => {
    const result = searchListings(corpus, makeParams({ pageSize: 2 }), options);
    expect(result.items).toHaveLength(2);
    expect(result.meta.totalItems).toBe(4);
    expect(result.meta.totalPages).toBe(2);
  });

  it('echoes the applied params so the UI can reconcile its state', () => {
    const params = makeParams({ city: 'Vienna', pageSize: 3 });
    expect(searchListings(corpus, params, options).appliedParams).toEqual(params);
  });

  describe('no matches', () => {
    it('returns an empty, well-formed response for a city with no listings', () => {
      const result = searchListings(corpus, makeParams({ city: 'Atlantis' }), options);
      expect(result.items).toEqual([]);
      expect(result.meta.totalItems).toBe(0);
      expect(result.meta.totalPages).toBe(0);
      expect(result.meta.pageOutOfRange).toBe(false);
      expect(result.meta.hasNextPage).toBe(false);
    });

    it('returns an empty response for an impossible price window', () => {
      const result = searchListings(corpus, makeParams({ minPrice: 900_000 }), options);
      expect(result.meta.totalItems).toBe(0);
    });

    it('handles an empty corpus', () => {
      const result = searchListings([], makeParams(), options);
      expect(result.items).toEqual([]);
      expect(result.meta.totalItems).toBe(0);
    });
  });

  describe('pagination boundaries', () => {
    const params = (page: number) => makeParams({ page, pageSize: 2 });

    it('never repeats or drops a listing across pages', () => {
      const first = searchListings(corpus, params(1), options).items.map((item) => item.listingKey);
      const second = searchListings(corpus, params(2), options).items.map((item) => item.listingKey);
      expect(new Set([...first, ...second]).size).toBe(4);
    });

    it('returns an empty page and flags a page past the end', () => {
      const result = searchListings(corpus, params(9), options);
      expect(result.items).toEqual([]);
      expect(result.meta.pageOutOfRange).toBe(true);
      expect(result.meta.totalPages).toBe(2);
      expect(result.meta.totalItems).toBe(4);
    });

    it('serves the last page correctly when it is partially full', () => {
      const result = searchListings(corpus, makeParams({ page: 2, pageSize: 3 }), options);
      expect(result.items).toHaveLength(1);
      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.hasPreviousPage).toBe(true);
    });
  });

  describe('tied scores', () => {
    it('orders identical scores deterministically and identically on repeat calls', () => {
      const tied = [
        makeListing({ id: 'Z', source: 'MLS_B', price: 500_000, listedDate: '2026-09-01', address: '9 Z St' }),
        makeListing({ id: 'Y', source: 'MLS_A', price: 500_000, listedDate: '2026-09-01', address: '8 Y St' }),
        makeListing({ id: 'X', source: 'MLS_A', price: 500_000, listedDate: '2026-09-01', address: '7 X St' }),
      ];
      const params = makeParams({ targetBudget: 500_000, pageSize: 10 });

      const first = searchListings(tied, params, options);
      const second = searchListings([...tied].reverse(), params, options);

      expect(first.items.map((item) => item.relevanceScore)).toEqual([
        first.items[0]!.relevanceScore,
        first.items[0]!.relevanceScore,
        first.items[0]!.relevanceScore,
      ]);
      // Same set, same order, regardless of input ordering.
      expect(first.items.map((i) => i.listingKey)).toEqual(second.items.map((i) => i.listingKey));
      expect(first.items.map((i) => i.listingKey)).toEqual(['MLS_A:X', 'MLS_A:Y', 'MLS_B:Z']);
    });

    it('keeps paging stable when scores tie', () => {
      const tied = Array.from({ length: 6 }, (_, index) =>
        makeListing({ id: `T${index}`, source: 'MLS_A', price: 500_000, listedDate: '2026-09-01', address: `${index} Tie St` }),
      );
      const page1 = searchListings(tied, makeParams({ page: 1, pageSize: 3 }), options).items.map((i) => i.listingKey);
      const page2 = searchListings(tied, makeParams({ page: 2, pageSize: 3 }), options).items.map((i) => i.listingKey);
      expect(page1.some((key) => page2.includes(key))).toBe(false);
    });
  });

  describe('deduplication', () => {
    const duplicated = [
      makeListing({ id: 'A1', source: 'MLS_A', address: '123 Main St, Apt 4B', price: 450_000, bedrooms: 2, sqft: 980 }),
      makeListing({ id: 'B7', source: 'MLS_B', address: '123 Main Street, Unit 4B', price: 452_000, bedrooms: 2, sqft: 980 }),
    ];

    it('collapses duplicates before counting, so totals reflect distinct properties', () => {
      const result = searchListings(duplicated, makeParams({ dedupe: true }), options);
      expect(result.meta.totalItems).toBe(1);
      expect(result.meta.duplicatesCollapsed).toBe(1);
      expect(result.items[0]?.duplicates).toHaveLength(1);
    });

    it('returns both copies when deduping is turned off', () => {
      const result = searchListings(duplicated, makeParams({ dedupe: false }), options);
      expect(result.meta.totalItems).toBe(2);
      expect(result.meta.duplicatesCollapsed).toBe(0);
      expect(result.items[0]?.duplicates).toEqual([]);
    });

    it('dedupes before filtering, so a price filter cannot resurrect the discarded copy', () => {
      // The kept copy is the cheaper A1 at 450k; a >451k filter must therefore
      // exclude the property entirely rather than fall back to B7.
      const result = searchListings(duplicated, makeParams({ minPrice: 451_000, dedupe: true }), options);
      expect(result.meta.totalItems).toBe(0);
    });
  });
});

describe('compareRanked', () => {
  const ranked = (overrides: Partial<RankedListing>): RankedListing => ({
    ...makeListing(),
    listingKey: 'MLS_A:1',
    relevanceScore: 50,
    breakdown: { budgetFit: null, recency: 0.5, keyword: null, status: 1 },
    duplicates: [],
    ...overrides,
  });

  it('puts the higher score first', () => {
    expect(compareRanked(ranked({ relevanceScore: 90 }), ranked({ relevanceScore: 10 }))).toBeLessThan(0);
  });

  it('falls back to the newer listing date', () => {
    const older = ranked({ listedDate: '2026-01-01', listingKey: 'A:1' });
    const newer = ranked({ listedDate: '2026-09-01', listingKey: 'Z:9' });
    expect(compareRanked(newer, older)).toBeLessThan(0);
  });

  it('falls back to the stable listing key when score and date tie', () => {
    const a = ranked({ listingKey: 'MLS_A:1' });
    const b = ranked({ listingKey: 'MLS_B:1' });
    expect(compareRanked(a, b)).toBeLessThan(0);
    expect(compareRanked(b, a)).toBeGreaterThan(0);
  });

  it('sorts a listing with an unparseable date after one with a valid date', () => {
    const valid = ranked({ listedDate: '2026-01-01', listingKey: 'A:1' });
    const broken = ranked({ listedDate: 'garbage', listingKey: 'A:2' });
    expect(compareRanked(valid, broken)).toBeLessThan(0);
    expect(compareRanked(broken, valid)).toBeGreaterThan(0);
  });
});
