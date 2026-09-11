import { describe, expect, it } from 'vitest';
import { dedupeListings, duplicateKey, pickPrimary } from '../src/domain/dedupe.js';
import { normaliseAddress } from '../src/domain/text.js';
import { makeListing } from './fixtures.js';

describe('normaliseAddress', () => {
  it.each([
    ['123 Main St, Apt 4B', '123 Main Street, Unit 4B'],
    ['456 Oak Ave', '456 Oak Avenue'],
    ['55 Elm Ct', '55 Elm Court'],
    ['789 Pine Rd', '789 pine road'],
    ['12 N Maple Dr', '12 North Maple Drive'],
  ])('canonicalises "%s" and "%s" to the same string', (a, b) => {
    expect(normaliseAddress(a)).toBe(normaliseAddress(b));
  });

  it('keeps genuinely different addresses apart', () => {
    expect(normaliseAddress('22 Birch Ln')).not.toBe(normaliseAddress('100 Maple Dr'));
    expect(normaliseAddress('123 Main St')).not.toBe(normaliseAddress('124 Main St'));
  });
});

describe('duplicateKey', () => {
  it('ignores ZIP, because feeds disagree on it', () => {
    const a = makeListing({ address: '456 Oak Ave', zip: '22150' });
    const b = makeListing({ address: '456 Oak Avenue', zip: '22151' });
    expect(duplicateKey(a)).toBe(duplicateKey(b));
  });

  it('separates listings with different bedroom counts at the same address', () => {
    const a = makeListing({ address: '1 Same St', bedrooms: 2 });
    const b = makeListing({ address: '1 Same St', bedrooms: 4 });
    expect(duplicateKey(a)).not.toBe(duplicateKey(b));
  });

  it('tolerates small sqft disagreements', () => {
    expect(duplicateKey(makeListing({ address: '1 A St', sqft: 1450 }))).toBe(
      duplicateKey(makeListing({ address: '1 A St', sqft: 1455 })),
    );
  });
});

describe('pickPrimary', () => {
  it('keeps the cheapest copy', () => {
    const cheap = makeListing({ id: 'cheap', price: 450_000 });
    const dear = makeListing({ id: 'dear', price: 452_000 });
    expect(pickPrimary([dear, cheap]).id).toBe('cheap');
  });

  it('breaks a price tie on the most recent listing date', () => {
    const older = makeListing({ id: 'older', price: 450_000, listedDate: '2026-08-01' });
    const newer = makeListing({ id: 'newer', price: 450_000, listedDate: '2026-09-01' });
    expect(pickPrimary([older, newer]).id).toBe('newer');
  });

  it('is independent of input order', () => {
    const a = makeListing({ id: 'a', source: 'MLS_A', price: 450_000, listedDate: '2026-08-01' });
    const b = makeListing({ id: 'b', source: 'MLS_B', price: 450_000, listedDate: '2026-08-01' });
    expect(pickPrimary([a, b]).id).toBe(pickPrimary([b, a]).id);
  });
});

describe('dedupeListings', () => {
  it('collapses a cross-feed duplicate pair into one listing', () => {
    const a = makeListing({ id: 'A1', source: 'MLS_A', address: '123 Main St, Apt 4B', price: 450_000, bedrooms: 2, sqft: 980 });
    const b = makeListing({ id: 'B7', source: 'MLS_B', address: '123 Main Street, Unit 4B', price: 452_000, bedrooms: 2, sqft: 980 });

    const result = dedupeListings([a, b]);

    expect(result.listings).toHaveLength(1);
    expect(result.listings[0]?.id).toBe('A1');
    expect(result.collapsedCount).toBe(1);
    expect(result.duplicates.get('MLS_A:A1')).toEqual([
      { listingKey: 'MLS_B:B7', id: 'B7', source: 'MLS_B', price: 452_000, listedDate: b.listedDate },
    ]);
  });

  it('leaves distinct properties untouched', () => {
    const listings = [
      makeListing({ address: '22 Birch Ln', city: 'Reston' }),
      makeListing({ address: '100 Maple Dr', city: 'Reston' }),
    ];
    expect(dedupeListings(listings).listings).toHaveLength(2);
    expect(dedupeListings(listings).collapsedCount).toBe(0);
  });

  it('does not merge same-named streets in different cities', () => {
    const listings = [
      makeListing({ address: '1 Main St', city: 'Vienna', latitude: 38.9, longitude: -77.26 }),
      makeListing({ address: '1 Main St', city: 'Reston', latitude: 38.95, longitude: -77.35 }),
    ];
    expect(dedupeListings(listings).listings).toHaveLength(2);
  });

  it('refuses to merge address twins that are geographically far apart', () => {
    const listings = [
      makeListing({ address: '1 Main St', city: 'Springfield', latitude: 38.78, longitude: -77.18 }),
      makeListing({ address: '1 Main St', city: 'Springfield', latitude: 40.12, longitude: -75.01 }),
    ];
    expect(dedupeListings(listings).listings).toHaveLength(2);
  });

  it('merges when coordinates are missing, falling back to the address key', () => {
    const listings = [
      makeListing({ address: '1 Main St', latitude: Number.NaN, longitude: Number.NaN }),
      makeListing({ address: '1 Main Street', latitude: Number.NaN, longitude: Number.NaN }),
    ];
    expect(dedupeListings(listings).listings).toHaveLength(1);
  });

  it('handles an empty input', () => {
    const result = dedupeListings([]);
    expect(result.listings).toEqual([]);
    expect(result.collapsedCount).toBe(0);
  });

  it('collapses a group of three copies into one', () => {
    const listings = [
      makeListing({ id: '1', source: 'A', address: '9 Elm Ct', price: 400_000 }),
      makeListing({ id: '2', source: 'B', address: '9 Elm Court', price: 405_000 }),
      makeListing({ id: '3', source: 'C', address: '9 elm ct.', price: 402_000 }),
    ];
    const result = dedupeListings(listings);
    expect(result.listings).toHaveLength(1);
    expect(result.collapsedCount).toBe(2);
    expect(result.duplicates.get('A:1')).toHaveLength(2);
  });
});
