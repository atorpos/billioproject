import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FacetsResponse, RankedListing, SearchResponse } from '@billio/shared';
import { App } from '../src/App.js';

function makeListing(overrides: Partial<RankedListing> = {}): RankedListing {
  return {
    id: 'A1',
    source: 'MLS_A',
    listingKey: 'MLS_A:A1',
    address: '123 Main St, Apt 4B',
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
    description: 'Bright top-floor condo near shops and transit.',
    relevanceScore: 87.5,
    breakdown: { budgetFit: 0.95, recency: 0.7, keyword: null, status: 1 },
    duplicates: [],
    ...overrides,
  };
}

function makeSearchResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  const items = overrides.items ?? [makeListing()];
  return {
    items,
    meta: {
      page: 1,
      pageSize: 5,
      totalItems: items.length,
      totalPages: items.length === 0 ? 0 : 1,
      hasPreviousPage: false,
      hasNextPage: false,
      pageOutOfRange: false,
      duplicatesCollapsed: 0,
      ...overrides.meta,
    },
    appliedParams: {
      minPrice: null,
      maxPrice: null,
      minBedrooms: null,
      city: null,
      keyword: null,
      status: null,
      targetBudget: null,
      dedupe: true,
      page: 1,
      pageSize: 5,
      ...overrides.appliedParams,
    },
  };
}

const FACETS: FacetsResponse = {
  cities: ['Fairfax', 'Reston', 'Springfield'],
  statuses: ['active', 'pending'],
  priceRange: { min: 399_000, max: 610_000 },
  bedroomsRange: { min: 2, max: 4 },
  totalListings: 12,
};

interface MockOptions {
  search?: () => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;
  facets?: () => { status: number; body: unknown };
  networkError?: boolean;
}

function mockApi(options: MockOptions = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (options.networkError && url.includes('/listings/search')) {
      throw new TypeError('Failed to fetch');
    }

    const handler = url.includes('/listings/facets')
      ? (options.facets ?? (() => ({ status: 200, body: FACETS })))
      : (options.search ?? (() => ({ status: 200, body: makeSearchResponse() })));

    const { status, body } = await handler();
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App — loading state', () => {
  it('shows a loading indicator before the first results arrive', async () => {
    const deferred: { resolve: () => void } = { resolve: () => {} };
    const pending = new Promise<void>((resolve) => {
      deferred.resolve = resolve;
    });

    mockApi({
      search: async () => {
        await pending;
        return { status: 200, body: makeSearchResponse() };
      },
    });

    render(<App />);
    expect(await screen.findByText(/searching listings/i)).toBeInTheDocument();

    deferred.resolve();
    await waitFor(() => expect(screen.queryByText(/searching listings/i)).not.toBeInTheDocument());
  });
});

describe('App — results', () => {
  it('renders address, price, bedrooms and relevance score for each result', async () => {
    mockApi();
    render(<App />);

    const card = await screen.findByRole('article');
    expect(within(card).getByText('123 Main St, Apt 4B')).toBeInTheDocument();
    expect(within(card).getByText('$450,000')).toBeInTheDocument();
    expect(within(card).getByText('2')).toBeInTheDocument();
    expect(within(card).getByText('87.5')).toBeInTheDocument();
    expect(within(card).getByText(/relevance/i)).toBeInTheDocument();
  });

  it('summarises what the user is looking at', async () => {
    mockApi({
      search: () => ({
        status: 200,
        body: makeSearchResponse({
          items: [makeListing()],
          meta: { page: 1, pageSize: 5, totalItems: 12, totalPages: 3, hasPreviousPage: false, hasNextPage: true, pageOutOfRange: false, duplicatesCollapsed: 2 },
        }),
      }),
    });
    render(<App />);

    expect(await screen.findByText(/page 1 of 3/i)).toBeInTheDocument();
    expect(screen.getByText(/2 duplicates merged/i)).toBeInTheDocument();
  });

  it('explains a score on demand', async () => {
    mockApi();
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /why this score/i }));
    expect(screen.getByRole('meter', { name: /budget fit/i })).toBeInTheDocument();
    expect(screen.getByText(/not scored — no keyword entered/i)).toBeInTheDocument();
  });
});

describe('App — no results', () => {
  it('explains an empty result set instead of showing a blank list', async () => {
    mockApi({
      search: () => ({
        status: 200,
        body: makeSearchResponse({
          items: [],
          meta: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false, pageOutOfRange: false, duplicatesCollapsed: 0 },
        }),
      }),
    });
    render(<App />);

    expect(await screen.findByText(/no listings match these filters/i)).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});

describe('App — error states', () => {
  it('surfaces a server validation error with its field issues and a retry', async () => {
    mockApi({
      search: () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Minimum price cannot be greater than maximum price.',
            issues: [{ field: 'minPrice', message: 'Minimum price cannot be greater than maximum price.' }],
          },
        },
      }),
    });
    render(<App />);

    expect(await screen.findByText(/search failed/i)).toBeInTheDocument();
    expect(screen.getByText(/minPrice:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('reports an unreachable API rather than hanging on the spinner', async () => {
    mockApi({ networkError: true });
    render(<App />);

    expect(await screen.findByText(/could not reach the listings service/i)).toBeInTheDocument();
  });

  it('retries on demand', async () => {
    const fetchMock = mockApi({
      search: () => ({ status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'boom', issues: [] } } }),
    });
    render(<App />);

    await screen.findByRole('button', { name: /try again/i });
    const callsBefore = fetchMock.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});

describe('App — invalid input', () => {
  it('blocks the request and explains the problem inline', async () => {
    const fetchMock = mockApi();
    render(<App />);
    await screen.findByRole('article');

    const callsBefore = fetchMock.mock.calls.length;
    await userEvent.type(screen.getByLabelText(/min price/i), '600000');
    await userEvent.type(screen.getByLabelText(/max price/i), '400000');

    expect(await screen.findByText(/check your filters/i)).toBeInTheDocument();
    expect(
      await screen.findAllByText(/minimum price cannot be greater than maximum price/i),
    ).not.toHaveLength(0);

    // No further request was made with the invalid combination.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('rejects a page size of zero before it reaches the API', async () => {
    mockApi();
    render(<App />);
    await screen.findByRole('article');

    const pageSize = screen.getByLabelText(/results per page/i);
    await userEvent.clear(pageSize);
    await userEvent.type(pageSize, '0');

    expect(await screen.findByText(/check your filters/i)).toBeInTheDocument();
  });
});

describe('App — pagination', () => {
  it('lets the user move between pages and requests the new page', async () => {
    const fetchMock = mockApi({
      search: () => ({
        status: 200,
        body: makeSearchResponse({
          items: [makeListing()],
          meta: { page: 1, pageSize: 5, totalItems: 12, totalPages: 3, hasPreviousPage: false, hasNextPage: true, pageOutOfRange: false, duplicatesCollapsed: 0 },
        }),
      }),
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /next/i }));

    await waitFor(() => {
      const searchCalls = fetchMock.mock.calls.map((call) => String(call[0])).filter((url) => url.includes('/search'));
      expect(searchCalls.some((url) => url.includes('page=2'))).toBe(true);
    });
  });

  it('offers a way back when the page is past the end of the results', async () => {
    mockApi({
      search: () => ({
        status: 200,
        body: makeSearchResponse({
          items: [],
          meta: { page: 9, pageSize: 5, totalItems: 12, totalPages: 3, hasPreviousPage: true, hasNextPage: false, pageOutOfRange: true, duplicatesCollapsed: 0 },
        }),
      }),
    });
    render(<App />);

    expect(await screen.findByText(/page 9 is past the last page/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to page 3/i })).toBeInTheDocument();
  });
});

describe('App — facets', () => {
  it('builds the city select from the dataset', async () => {
    mockApi();
    render(<App />);

    // The select only replaces the text fallback once facet data lands.
    const select = await screen.findByRole('combobox', { name: /city/i });
    expect(within(select).getByRole('option', { name: 'Springfield' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'All cities' })).toBeInTheDocument();
  });

  it('falls back to a text input when facets cannot be loaded', async () => {
    mockApi({ facets: () => ({ status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'boom', issues: [] } } }) });
    render(<App />);

    await screen.findByRole('article');
    const city = screen.getByLabelText(/city/i);
    expect(city.tagName).toBe('INPUT');
    expect(screen.queryByRole('combobox', { name: /city/i })).not.toBeInTheDocument();
  });
});
