import { LISTING_STATUSES, type FieldIssue, type ListingStatus, type SearchParams } from './types.js';

/**
 * Validation of search input lives here — in shared code — so the API and the
 * React client enforce exactly the same rules. The client can therefore show a
 * field-level error before spending a round trip, while the server never trusts
 * the client and re-validates every request.
 */

export const PAGINATION_LIMITS = {
  minPage: 1,
  minPageSize: 1,
  maxPageSize: 100,
  defaultPageSize: 5,
} as const;

export const TEXT_LIMITS = {
  maxCityLength: 80,
  maxKeywordLength: 120,
} as const;

/** Upper sanity bound on money fields; keeps nonsense like 1e308 out of the maths. */
export const MAX_MONEY = 1_000_000_000;

export type RawSearchQuery = Record<string, unknown>;

export type ParseResult =
  | { ok: true; params: SearchParams }
  | { ok: false; issues: FieldIssue[] };

export const DEFAULT_SEARCH_PARAMS: SearchParams = {
  minPrice: null,
  maxPrice: null,
  minBedrooms: null,
  city: null,
  keyword: null,
  status: null,
  targetBudget: null,
  dedupe: true,
  page: 1,
  pageSize: PAGINATION_LIMITS.defaultPageSize,
};

/** Treats `undefined`, `null` and empty/whitespace-only strings as "not supplied". */
function isAbsent(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Query strings can legitimately repeat a key (`?city=A&city=B`). Rather than
 * silently picking one, we reject it — guessing the user's intent is how wrong
 * data gets returned.
 */
function single(value: unknown, field: string, issues: FieldIssue[]): unknown {
  if (Array.isArray(value)) {
    if (value.length === 1) return value[0];
    issues.push({ field, message: `${field} was supplied more than once; provide a single value.` });
    return undefined;
  }
  return value;
}

interface NumberOptions {
  min?: number;
  max?: number;
  integer?: boolean;
  /** Label used in messages, e.g. "Minimum price". */
  label: string;
}

function parseNumber(
  raw: unknown,
  field: string,
  options: NumberOptions,
  issues: FieldIssue[],
): number | null {
  const value = single(raw, field, issues);
  if (isAbsent(value)) return null;

  // `Number('')` is 0 and `Number(' ')` is 0 — both already excluded by isAbsent.
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());

  if (!Number.isFinite(parsed)) {
    issues.push({ field, message: `${options.label} must be a number.` });
    return null;
  }
  if (options.integer && !Number.isInteger(parsed)) {
    issues.push({ field, message: `${options.label} must be a whole number.` });
    return null;
  }
  if (options.min !== undefined && parsed < options.min) {
    issues.push({ field, message: `${options.label} must be ${options.min} or more.` });
    return null;
  }
  if (options.max !== undefined && parsed > options.max) {
    issues.push({ field, message: `${options.label} must be ${options.max} or less.` });
    return null;
  }
  return parsed;
}

function parseText(
  raw: unknown,
  field: string,
  maxLength: number,
  label: string,
  issues: FieldIssue[],
): string | null {
  const value = single(raw, field, issues);
  if (isAbsent(value)) return null;
  if (typeof value !== 'string' && typeof value !== 'number') {
    issues.push({ field, message: `${label} must be text.` });
    return null;
  }
  // Collapse internal runs of whitespace so " new   york " and "new york" behave alike.
  const trimmed = String(value).trim().replace(/\s+/g, ' ');
  if (trimmed.length > maxLength) {
    issues.push({ field, message: `${label} must be ${maxLength} characters or fewer.` });
    return null;
  }
  return trimmed;
}

function parseBoolean(raw: unknown, field: string, fallback: boolean, issues: FieldIssue[]): boolean {
  const value = single(raw, field, issues);
  if (isAbsent(value)) return fallback;
  if (typeof value === 'boolean') return value;
  const normalised = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalised)) return true;
  if (['false', '0', 'no', 'off'].includes(normalised)) return false;
  issues.push({ field, message: `${field} must be true or false.` });
  return fallback;
}

function parseStatus(raw: unknown, issues: FieldIssue[]): ListingStatus | null {
  const value = single(raw, 'status', issues);
  if (isAbsent(value)) return null;
  const normalised = String(value).trim().toLowerCase();
  if ((LISTING_STATUSES as readonly string[]).includes(normalised)) {
    return normalised as ListingStatus;
  }
  issues.push({
    field: 'status',
    message: `status must be one of: ${LISTING_STATUSES.join(', ')}.`,
  });
  return null;
}

/**
 * Validates raw query input and returns either fully-normalised params or the
 * complete list of problems. All fields are checked before returning so the user
 * sees every mistake at once instead of fixing them one reload at a time.
 */
export function parseSearchParams(raw: RawSearchQuery = {}): ParseResult {
  const issues: FieldIssue[] = [];

  const minPrice = parseNumber(raw.minPrice, 'minPrice', { min: 0, max: MAX_MONEY, label: 'Minimum price' }, issues);
  const maxPrice = parseNumber(raw.maxPrice, 'maxPrice', { min: 0, max: MAX_MONEY, label: 'Maximum price' }, issues);
  const minBedrooms = parseNumber(raw.minBedrooms, 'minBedrooms', { min: 0, max: 50, integer: true, label: 'Minimum bedrooms' }, issues);
  const targetBudget = parseNumber(raw.targetBudget, 'targetBudget', { min: 1, max: MAX_MONEY, label: 'Target budget' }, issues);

  const page = parseNumber(raw.page, 'page', { min: PAGINATION_LIMITS.minPage, integer: true, label: 'Page' }, issues);
  const pageSize = parseNumber(
    raw.pageSize,
    'pageSize',
    {
      min: PAGINATION_LIMITS.minPageSize,
      max: PAGINATION_LIMITS.maxPageSize,
      integer: true,
      label: 'Page size',
    },
    issues,
  );

  const city = parseText(raw.city, 'city', TEXT_LIMITS.maxCityLength, 'City', issues);
  const keyword = parseText(raw.keyword, 'keyword', TEXT_LIMITS.maxKeywordLength, 'Keyword', issues);
  const status = parseStatus(raw.status, issues);
  const dedupe = parseBoolean(raw.dedupe, 'dedupe', DEFAULT_SEARCH_PARAMS.dedupe, issues);

  // Cross-field rule: only meaningful once both bounds parsed cleanly.
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    issues.push({
      field: 'minPrice',
      message: 'Minimum price cannot be greater than maximum price.',
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    params: {
      minPrice,
      maxPrice,
      minBedrooms,
      city,
      keyword,
      status,
      targetBudget,
      dedupe,
      page: page ?? DEFAULT_SEARCH_PARAMS.page,
      pageSize: pageSize ?? DEFAULT_SEARCH_PARAMS.pageSize,
    },
  };
}

/** Serialises params back into a query string, omitting anything unset. */
export function toQueryString(params: Partial<SearchParams>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    query.set(key, String(value));
  }
  return query.toString();
}

/** Groups issues by field for convenient per-input rendering. */
export function issuesByField(issues: FieldIssue[]): Record<string, string[]> {
  return issues.reduce<Record<string, string[]>>((acc, issue) => {
    (acc[issue.field] ??= []).push(issue.message);
    return acc;
  }, {});
}
