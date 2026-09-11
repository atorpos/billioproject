import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEARCH_PARAMS,
  issuesByField,
  PAGINATION_LIMITS,
  parseSearchParams,
  toQueryString,
} from '../src/index.js';

function expectIssue(result: ReturnType<typeof parseSearchParams>, field: string): string {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected failure');
  const issue = result.issues.find((candidate) => candidate.field === field);
  expect(issue, `expected an issue on "${field}", got ${JSON.stringify(result.issues)}`).toBeDefined();
  return issue!.message;
}

describe('parseSearchParams', () => {
  it('applies defaults when nothing is supplied', () => {
    const result = parseSearchParams({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.params).toEqual(DEFAULT_SEARCH_PARAMS);
  });

  it('treats empty strings and whitespace as "not supplied" rather than as zero', () => {
    const result = parseSearchParams({ minPrice: '', maxPrice: '   ', city: '', keyword: '  ' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.params.minPrice).toBeNull();
    expect(result.params.maxPrice).toBeNull();
    expect(result.params.city).toBeNull();
    expect(result.params.keyword).toBeNull();
  });

  it('coerces numeric strings from the query string', () => {
    const result = parseSearchParams({ minPrice: '100000', minBedrooms: '3', page: '2', pageSize: '10' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.params.minPrice).toBe(100_000);
    expect(result.params.minBedrooms).toBe(3);
    expect(result.params.page).toBe(2);
    expect(result.params.pageSize).toBe(10);
  });

  describe('invalid filter values', () => {
    it('rejects minPrice greater than maxPrice', () => {
      const message = expectIssue(parseSearchParams({ minPrice: '600000', maxPrice: '400000' }), 'minPrice');
      expect(message).toMatch(/cannot be greater than maximum price/i);
    });

    it('accepts minPrice equal to maxPrice', () => {
      const result = parseSearchParams({ minPrice: '450000', maxPrice: '450000' });
      expect(result.ok).toBe(true);
    });

    it('rejects non-numeric prices', () => {
      expectIssue(parseSearchParams({ minPrice: 'cheap' }), 'minPrice');
      expectIssue(parseSearchParams({ maxPrice: 'NaN' }), 'maxPrice');
    });

    it('rejects negative prices', () => {
      expectIssue(parseSearchParams({ minPrice: '-1' }), 'minPrice');
    });

    it('rejects non-finite numbers', () => {
      expectIssue(parseSearchParams({ targetBudget: 'Infinity' }), 'targetBudget');
    });

    it('rejects fractional bedrooms', () => {
      const message = expectIssue(parseSearchParams({ minBedrooms: '2.5' }), 'minBedrooms');
      expect(message).toMatch(/whole number/i);
    });

    it('rejects a target budget of zero', () => {
      expectIssue(parseSearchParams({ targetBudget: '0' }), 'targetBudget');
    });

    it('rejects an unknown status instead of ignoring it', () => {
      const message = expectIssue(parseSearchParams({ status: 'archived' }), 'status');
      expect(message).toMatch(/active, pending, sold/);
    });

    it('rejects repeated query parameters rather than guessing', () => {
      expectIssue(parseSearchParams({ city: ['Vienna', 'Reston'] }), 'city');
    });

    it('reports every problem at once', () => {
      const result = parseSearchParams({ minPrice: 'abc', minBedrooms: '1.5', pageSize: '0' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(Object.keys(issuesByField(result.issues)).sort()).toEqual(['minBedrooms', 'minPrice', 'pageSize']);
    });
  });

  describe('pagination bounds', () => {
    it('rejects a pageSize of zero', () => {
      const message = expectIssue(parseSearchParams({ pageSize: '0' }), 'pageSize');
      expect(message).toMatch(/must be 1 or more/i);
    });

    it('rejects a negative pageSize', () => {
      expectIssue(parseSearchParams({ pageSize: '-10' }), 'pageSize');
    });

    it('rejects a pageSize above the maximum', () => {
      expectIssue(parseSearchParams({ pageSize: String(PAGINATION_LIMITS.maxPageSize + 1) }), 'pageSize');
    });

    it('accepts the exact pageSize boundaries', () => {
      expect(parseSearchParams({ pageSize: String(PAGINATION_LIMITS.minPageSize) }).ok).toBe(true);
      expect(parseSearchParams({ pageSize: String(PAGINATION_LIMITS.maxPageSize) }).ok).toBe(true);
    });

    it('rejects page numbers below 1', () => {
      expectIssue(parseSearchParams({ page: '0' }), 'page');
      expectIssue(parseSearchParams({ page: '-3' }), 'page');
    });

    it('allows a page beyond the result set — that is a runtime state, not a bad request', () => {
      expect(parseSearchParams({ page: '9999' }).ok).toBe(true);
    });
  });

  describe('text handling', () => {
    it('trims and collapses whitespace', () => {
      const result = parseSearchParams({ city: '  Falls   Church  ' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.params.city).toBe('Falls Church');
    });

    it('rejects over-long keywords', () => {
      expectIssue(parseSearchParams({ keyword: 'x'.repeat(200) }), 'keyword');
    });
  });

  describe('boolean handling', () => {
    it.each([
      ['true', true],
      ['false', false],
      ['1', true],
      ['0', false],
      [true, true],
    ])('parses dedupe=%s as %s', (input, expected) => {
      const result = parseSearchParams({ dedupe: input });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.params.dedupe).toBe(expected);
    });

    it('rejects a non-boolean dedupe value', () => {
      expectIssue(parseSearchParams({ dedupe: 'maybe' }), 'dedupe');
    });
  });
});

describe('toQueryString', () => {
  it('omits null and empty values', () => {
    const query = toQueryString({ city: 'Vienna', minPrice: null, keyword: '', page: 2 });
    expect(query).toBe('city=Vienna&page=2');
  });

  it('round-trips through parseSearchParams', () => {
    const original = parseSearchParams({ city: 'Reston', minPrice: '400000', page: '3' });
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    const reparsed = parseSearchParams(Object.fromEntries(new URLSearchParams(toQueryString(original.params))));
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.params).toEqual(original.params);
  });
});
