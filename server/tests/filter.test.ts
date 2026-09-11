import { describe, expect, it } from 'vitest';
import { filterListings, matchesCity, matchesKeyword } from '../src/domain/filter.js';
import { toTerms } from '../src/domain/text.js';
import { makeListing, makeParams } from './fixtures.js';

const listings = [
  makeListing({ id: 'cheap', price: 300_000, bedrooms: 1, city: 'Fairfax', description: 'Cozy starter home, no pets.' }),
  makeListing({ id: 'mid', price: 500_000, bedrooms: 3, city: 'Vienna', description: 'Quiet cul-de-sac, walkable to Metro.' }),
  makeListing({ id: 'big', price: 800_000, bedrooms: 5, city: 'Reston', description: 'Spacious family home. Pets welcome.' }),
  makeListing({ id: 'pending', price: 520_000, bedrooms: 3, city: 'Vienna', status: 'pending', description: 'Corner lot.' }),
];

const ids = (results: ReturnType<typeof filterListings>) => results.map((listing) => listing.id).sort();

describe('price filters', () => {
  it('includes listings at the exact boundaries', () => {
    const result = filterListings(listings, makeParams({ minPrice: 500_000, maxPrice: 520_000, dedupe: false }));
    expect(ids(result)).toEqual(['mid', 'pending']);
  });

  it('applies minPrice and maxPrice independently', () => {
    expect(ids(filterListings(listings, makeParams({ minPrice: 520_000, dedupe: false })))).toEqual(['big', 'pending']);
    expect(ids(filterListings(listings, makeParams({ maxPrice: 300_000, dedupe: false })))).toEqual(['cheap']);
  });

  it('returns nothing when the range excludes everything', () => {
    expect(filterListings(listings, makeParams({ minPrice: 900_000, dedupe: false }))).toHaveLength(0);
  });
});

describe('bedroom filter', () => {
  it('is inclusive of the minimum', () => {
    expect(ids(filterListings(listings, makeParams({ minBedrooms: 3, dedupe: false })))).toEqual(['big', 'mid', 'pending']);
  });

  it('returns nothing when no listing has enough bedrooms', () => {
    expect(filterListings(listings, makeParams({ minBedrooms: 9, dedupe: false }))).toHaveLength(0);
  });
});

describe('city filter', () => {
  it('matches regardless of case and surrounding whitespace', () => {
    expect(matchesCity(makeListing({ city: 'Vienna' }), '  vienna ')).toBe(true);
  });

  it('does not match a different city', () => {
    expect(matchesCity(makeListing({ city: 'Vienna' }), 'Reston')).toBe(false);
  });

  it('returns an empty result set for a city with no listings', () => {
    expect(filterListings(listings, makeParams({ city: 'Atlantis', dedupe: false }))).toHaveLength(0);
  });

  it('does not substring-match one city into another', () => {
    expect(matchesCity(makeListing({ city: 'Springfield' }), 'Spring')).toBe(false);
  });
});

describe('status filter', () => {
  it('narrows to the requested status only', () => {
    expect(ids(filterListings(listings, makeParams({ status: 'pending', dedupe: false })))).toEqual(['pending']);
  });
});

describe('keyword filter', () => {
  const listing = makeListing({ description: 'Updated kitchen, fenced yard, close to schools.' });

  it('matches a single term in the description', () => {
    expect(matchesKeyword(listing, toTerms('kitchen'))).toBe(true);
  });

  it('uses OR semantics so a multi-word query still returns candidates', () => {
    expect(matchesKeyword(listing, toTerms('kitchen submarine'))).toBe(true);
  });

  it('rejects a listing matching none of the terms', () => {
    expect(matchesKeyword(listing, toTerms('submarine helipad'))).toBe(false);
  });

  it('lets every listing through when no keyword is supplied', () => {
    expect(matchesKeyword(listing, [])).toBe(true);
  });

  it('also searches the address so a street-name query works', () => {
    expect(matchesKeyword(makeListing({ address: '42 Willow Way', description: 'Corner lot.' }), toTerms('willow'))).toBe(true);
  });
});

describe('combined filters', () => {
  it('applies every active filter together', () => {
    const result = filterListings(
      listings,
      makeParams({ minPrice: 400_000, maxPrice: 600_000, minBedrooms: 3, city: 'Vienna', status: 'active', dedupe: false }),
    );
    expect(ids(result)).toEqual(['mid']);
  });

  it('never mutates the input array', () => {
    const input = [...listings];
    filterListings(input, makeParams({ minPrice: 400_000, dedupe: false }));
    expect(input).toEqual(listings);
  });
});
