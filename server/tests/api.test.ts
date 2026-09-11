import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { ApiErrorBody, SearchResponse } from '@billio/shared';
import { createApp } from '../src/app.js';
import { ListingsRepository } from '../src/data/listings-repository.js';
import { makeListing } from './fixtures.js';

const listings = [
  makeListing({ id: 'A1', source: 'MLS_A', address: '123 Main St, Apt 4B', city: 'Springfield', price: 450_000, bedrooms: 2, sqft: 980, listedDate: '2026-08-29', description: 'Bright top-floor condo near shops and transit. Pet friendly.' }),
  makeListing({ id: 'B7', source: 'MLS_B', address: '123 Main Street, Unit 4B', city: 'Springfield', price: 452_000, bedrooms: 2, sqft: 980, listedDate: '2026-08-27', description: 'Top floor condo, walk to shopping. Pets allowed.' }),
  makeListing({ id: 'A2', source: 'MLS_A', address: '456 Oak Ave', city: 'Springfield', price: 525_000, bedrooms: 3, sqft: 1450, listedDate: '2026-09-02', description: 'Updated kitchen, fenced yard, close to schools.' }),
  makeListing({ id: 'A4', source: 'MLS_A', address: '22 Birch Ln', city: 'Reston', price: 610_000, bedrooms: 4, sqft: 2100, listedDate: '2026-09-03', description: 'Spacious family home. Pets welcome.' }),
  makeListing({ id: 'A7', source: 'MLS_A', address: '42 Willow Way', city: 'Chantilly', price: 540_000, bedrooms: 4, sqft: 1950, listedDate: '2026-07-28', status: 'pending', description: 'Corner lot, recently painted, no pets due to HOA.' }),
];

const app = createApp(ListingsRepository.fromListings(listings));

const search = (query: string) => request(app).get(`/api/listings/search${query}`);

describe('GET /api/health', () => {
  it('reports how many listings are loaded', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', listings: listings.length });
  });
});

describe('GET /api/listings/facets', () => {
  it('returns the cities, statuses and ranges present in the data', async () => {
    const response = await request(app).get('/api/listings/facets').expect(200);
    expect(response.body.cities).toEqual(['Chantilly', 'Reston', 'Springfield']);
    expect(response.body.statuses).toEqual(expect.arrayContaining(['active', 'pending']));
    expect(response.body.priceRange).toEqual({ min: 450_000, max: 610_000 });
    expect(response.body.totalListings).toBe(listings.length);
  });
});

describe('GET /api/listings/search', () => {
  it('returns ranked results with the fields the UI needs', async () => {
    const response = await search('?targetBudget=500000&pageSize=10').expect(200);
    const body = response.body as SearchResponse;

    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item).toMatchObject({
        address: expect.any(String),
        price: expect.any(Number),
        bedrooms: expect.any(Number),
        relevanceScore: expect.any(Number),
        listingKey: expect.any(String),
      });
      expect(item.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(item.relevanceScore).toBeLessThanOrEqual(100);
    }

    const scores = body.items.map((item) => item.relevanceScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('collapses cross-feed duplicates by default', async () => {
    const response = await search('?pageSize=10').expect(200);
    const body = response.body as SearchResponse;
    expect(body.meta.duplicatesCollapsed).toBe(1);
    expect(body.items.map((item) => item.id)).not.toContain('B7');
  });

  it('honours dedupe=false', async () => {
    const response = await search('?pageSize=10&dedupe=false').expect(200);
    expect((response.body as SearchResponse).meta.totalItems).toBe(listings.length);
  });

  it('paginates, exposing page metadata', async () => {
    const response = await search('?pageSize=2&page=2').expect(200);
    const body = response.body as SearchResponse;
    expect(body.items).toHaveLength(2);
    expect(body.meta).toMatchObject({ page: 2, pageSize: 2, hasPreviousPage: true });
  });

  it('returns an empty page with pageOutOfRange rather than an error', async () => {
    const response = await search('?pageSize=2&page=50').expect(200);
    const body = response.body as SearchResponse;
    expect(body.items).toEqual([]);
    expect(body.meta.pageOutOfRange).toBe(true);
    expect(body.meta.totalItems).toBeGreaterThan(0);
  });

  it('returns an explicit empty result for a city with no matches', async () => {
    const response = await search('?city=Atlantis').expect(200);
    const body = response.body as SearchResponse;
    expect(body.items).toEqual([]);
    expect(body.meta.totalItems).toBe(0);
    expect(body.meta.totalPages).toBe(0);
  });

  describe('invalid input', () => {
    it('rejects minPrice greater than maxPrice with a field-level issue', async () => {
      const response = await search('?minPrice=600000&maxPrice=400000').expect(400);
      const body = response.body as ApiErrorBody;
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.issues).toContainEqual({
        field: 'minPrice',
        message: 'Minimum price cannot be greater than maximum price.',
      });
    });

    it('rejects a pageSize of zero', async () => {
      const response = await search('?pageSize=0').expect(400);
      expect((response.body as ApiErrorBody).error.issues[0]?.field).toBe('pageSize');
    });

    it('rejects a negative pageSize', async () => {
      await search('?pageSize=-5').expect(400);
    });

    it('rejects a non-numeric price', async () => {
      await search('?minPrice=cheap').expect(400);
    });

    it('rejects an unknown status', async () => {
      await search('?status=archived').expect(400);
    });

    it('rejects page 0', async () => {
      await search('?page=0').expect(400);
    });

    it('reports several invalid fields in one response', async () => {
      const response = await search('?minPrice=abc&pageSize=0&minBedrooms=1.5').expect(400);
      const body = response.body as ApiErrorBody;
      expect(body.error.issues.map((issue) => issue.field).sort()).toEqual([
        'minBedrooms',
        'minPrice',
        'pageSize',
      ]);
    });

    it('never returns partial results alongside an error', async () => {
      const response = await search('?pageSize=0').expect(400);
      expect(response.body).not.toHaveProperty('items');
    });
  });

  it('returns a structured 404 for an unknown route', async () => {
    const response = await request(app).get('/api/nope').expect(404);
    expect((response.body as ApiErrorBody).error.code).toBe('NOT_FOUND');
  });
});
