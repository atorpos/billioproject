import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LISTING_STATUSES, type FacetsResponse, type Listing, type ListingStatus } from '@billio/shared';
import { findUpwards } from '../paths.js';

const DATA_FILE = 'data/sample_listings.json';

/**
 * Resolved lazily so an unusual deployment layout surfaces as a clear startup
 * error naming the override, rather than as a crash at import time.
 */
function defaultDataPath(): string {
  const fromEnv = process.env.LISTINGS_DATA_PATH;
  if (fromEnv) return path.resolve(fromEnv);

  const found = findUpwards(DATA_FILE);
  if (found) return found;

  throw new Error(
    `Could not locate ${DATA_FILE} near the server bundle. Set LISTINGS_DATA_PATH to its absolute path.`,
  );
}

/**
 * Feeds are external systems, so the file is validated rather than cast. A single
 * malformed record is skipped with a warning instead of taking down the whole
 * search — one bad row in a feed should not mean zero results.
 */
export function parseListings(raw: unknown): { listings: Listing[]; skipped: number } {
  if (!Array.isArray(raw)) {
    throw new Error('Listing data must be a JSON array.');
  }

  const listings: Listing[] = [];
  let skipped = 0;

  for (const entry of raw) {
    const listing = toListing(entry);
    if (listing) listings.push(listing);
    else skipped += 1;
  }

  return { listings, skipped };
}

function toListing(entry: unknown): Listing | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const record = entry as Record<string, unknown>;

  const text = (key: string): string | null =>
    typeof record[key] === 'string' && record[key].trim() !== '' ? (record[key] as string).trim() : null;
  const num = (key: string): number | null =>
    typeof record[key] === 'number' && Number.isFinite(record[key]) ? (record[key] as number) : null;

  const id = text('id');
  const source = text('source');
  const address = text('address');
  const listedDate = text('listedDate');
  const price = num('price');

  if (!id || !source || !address || !listedDate || price === null) return null;
  if (Number.isNaN(Date.parse(listedDate))) return null;

  const status = (text('status') ?? '').toLowerCase();

  return {
    id,
    source,
    address,
    city: text('city') ?? '',
    state: text('state') ?? '',
    zip: text('zip') ?? '',
    price,
    bedrooms: num('bedrooms') ?? 0,
    bathrooms: num('bathrooms') ?? 0,
    sqft: num('sqft') ?? 0,
    latitude: num('latitude') ?? Number.NaN,
    longitude: num('longitude') ?? Number.NaN,
    listedDate,
    status: (LISTING_STATUSES as readonly string[]).includes(status)
      ? (status as ListingStatus)
      : 'active',
    description: text('description') ?? '',
  };
}

/** In-memory repository. A real deployment would swap this for a database. */
export class ListingsRepository {
  private constructor(private readonly listings: Listing[], readonly skippedRecords: number) {}

  static fromListings(listings: Listing[], skipped = 0): ListingsRepository {
    return new ListingsRepository(listings, skipped);
  }

  static async load(dataPath: string = defaultDataPath()): Promise<ListingsRepository> {
    const contents = await readFile(dataPath, 'utf8');
    const { listings, skipped } = parseListings(JSON.parse(contents));
    return new ListingsRepository(listings, skipped);
  }

  all(): readonly Listing[] {
    return this.listings;
  }

  /** Facets let the UI build real inputs (a city select, price bounds) from data. */
  facets(): FacetsResponse {
    const cities = [...new Set(this.listings.map((l) => l.city).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
    const prices = this.listings.map((l) => l.price);
    const bedrooms = this.listings.map((l) => l.bedrooms);
    const statuses = LISTING_STATUSES.filter((status) => this.listings.some((l) => l.status === status));

    return {
      cities,
      statuses,
      priceRange: {
        min: prices.length ? Math.min(...prices) : 0,
        max: prices.length ? Math.max(...prices) : 0,
      },
      bedroomsRange: {
        min: bedrooms.length ? Math.min(...bedrooms) : 0,
        max: bedrooms.length ? Math.max(...bedrooms) : 0,
      },
      totalListings: this.listings.length,
    };
  }
}
