import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { ListingsRepository } from '../src/data/listings-repository.js';
import { findUpwards } from '../src/paths.js';
import { makeListing } from './fixtures.js';

const repository = ListingsRepository.fromListings([makeListing()]);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const ENV_KEYS = ['CORS_ORIGIN', 'CLIENT_DIST_PATH', 'LISTINGS_DATA_PATH'] as const;
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

/**
 * The server runs from `server/src` under tsx in development and from a bundled
 * `server/dist/index.js` in production. These paths must resolve in both.
 */
describe('findUpwards', () => {
  it('locates the dataset from the module’s own directory', () => {
    expect(findUpwards('data/sample_listings.json')).toBe(
      path.join(REPO_ROOT, 'data', 'sample_listings.json'),
    );
  });

  it('returns null rather than throwing when nothing matches', () => {
    expect(findUpwards('definitely/not/here.json')).toBeNull();
  });

  it('does not escape past the filesystem root', () => {
    expect(findUpwards('no-such-file', 200)).toBeNull();
  });
});

describe('LISTINGS_DATA_PATH', () => {
  it('loads the dataset from an explicit override', async () => {
    const loaded = await ListingsRepository.load(path.join(REPO_ROOT, 'data', 'sample_listings.json'));
    expect(loaded.all().length).toBeGreaterThan(0);
  });

  it('fails loudly when the override points at nothing', async () => {
    await expect(ListingsRepository.load('/tmp/definitely-missing-listings.json')).rejects.toThrow();
  });
});

describe('CORS', () => {
  it('sends no Access-Control-Allow-Origin by default', async () => {
    delete process.env.CORS_ORIGIN;
    const response = await request(createApp(repository))
      .get('/api/health')
      .set('Origin', 'https://somewhere.example')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows an explicitly configured origin', async () => {
    process.env.CORS_ORIGIN = 'https://app.example.com';
    const response = await request(createApp(repository))
      .get('/api/health')
      .set('Origin', 'https://app.example.com')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('https://app.example.com');
  });

  it('does not allow an origin outside the configured list', async () => {
    process.env.CORS_ORIGIN = 'https://app.example.com';
    const response = await request(createApp(repository))
      .get('/api/health')
      .set('Origin', 'https://evil.example')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('supports a comma-separated list', async () => {
    process.env.CORS_ORIGIN = 'https://a.example.com, https://b.example.com';
    const response = await request(createApp(repository))
      .get('/api/health')
      .set('Origin', 'https://b.example.com')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('https://b.example.com');
  });

  it('supports an explicit wildcard for a public API', async () => {
    process.env.CORS_ORIGIN = '*';
    const response = await request(createApp(repository))
      .get('/api/health')
      .set('Origin', 'https://anywhere.example')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('https://anywhere.example');
  });
});

describe('CLIENT_DIST_PATH', () => {
  it('warns and serves API only when pointed at a missing directory', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.CLIENT_DIST_PATH = '/tmp/definitely-not-a-client-build';

    const app = createApp(repository);
    await request(app).get('/api/health').expect(200);
    // No SPA fallback is registered, so an unknown route is a structured 404.
    await request(app).get('/unknown-route').expect(404);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('CLIENT_DIST_PATH'));
  });
});

describe('security headers', () => {
  it('does not advertise the framework', async () => {
    const response = await request(createApp(repository)).get('/api/health').expect(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
