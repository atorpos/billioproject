import { describe, expect, it } from 'vitest';
import { ListingsRepository, parseListings } from '../src/data/listings-repository.js';

describe('parseListings', () => {
  const valid = {
    id: 'A1',
    source: 'MLS_A',
    address: '123 Main St',
    city: 'Springfield',
    state: 'VA',
    zip: '22150',
    price: 450_000,
    bedrooms: 2,
    bathrooms: 1.5,
    sqft: 980,
    latitude: 38.7893,
    longitude: -77.1873,
    listedDate: '2026-08-29',
    status: 'active',
    description: 'Bright condo.',
  };

  it('accepts a well-formed record', () => {
    const { listings, skipped } = parseListings([valid]);
    expect(listings).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it('rejects a non-array payload', () => {
    expect(() => parseListings({})).toThrow(/must be a JSON array/);
  });

  it('skips a malformed record instead of failing the whole feed', () => {
    const { listings, skipped } = parseListings([valid, { id: 'B', source: 'MLS_B' }, null, 'nope']);
    expect(listings).toHaveLength(1);
    expect(skipped).toBe(3);
  });

  it('skips a record with an unparseable listedDate', () => {
    const { skipped } = parseListings([{ ...valid, listedDate: 'yesterday' }]);
    expect(skipped).toBe(1);
  });

  it('skips a record with a non-numeric price', () => {
    const { skipped } = parseListings([{ ...valid, price: '450000' }]);
    expect(skipped).toBe(1);
  });

  it('falls back to "active" for an unrecognised status', () => {
    const { listings } = parseListings([{ ...valid, status: 'withdrawn' }]);
    expect(listings[0]?.status).toBe('active');
  });

  it('defaults missing optional numbers to 0 rather than NaN', () => {
    const { listings } = parseListings([{ ...valid, bedrooms: undefined, sqft: undefined }]);
    expect(listings[0]?.bedrooms).toBe(0);
    expect(listings[0]?.sqft).toBe(0);
  });
});

describe('ListingsRepository', () => {
  it('loads and validates the bundled sample dataset', async () => {
    const repository = await ListingsRepository.load();
    expect(repository.all().length).toBeGreaterThan(0);
    expect(repository.skippedRecords).toBe(0);
  });

  it('derives facets from the bundled dataset', async () => {
    const repository = await ListingsRepository.load();
    const facets = repository.facets();

    expect(facets.cities).toContain('Springfield');
    expect(facets.cities).toEqual([...facets.cities].sort((a, b) => a.localeCompare(b)));
    expect(facets.priceRange.min).toBeLessThanOrEqual(facets.priceRange.max);
    expect(facets.totalListings).toBe(repository.all().length);
  });

  it('returns zeroed facets for an empty dataset instead of Infinity', () => {
    const facets = ListingsRepository.fromListings([]).facets();
    expect(facets.priceRange).toEqual({ min: 0, max: 0 });
    expect(facets.cities).toEqual([]);
    expect(facets.totalListings).toBe(0);
  });
});
