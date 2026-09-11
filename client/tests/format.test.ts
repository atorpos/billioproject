import { describe, expect, it } from 'vitest';
import {
  formatBathrooms,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeDays,
} from '../src/utils/format.js';

const NOW = new Date('2026-09-11T00:00:00.000Z');

describe('formatCurrency', () => {
  it('formats whole dollars without cents', () => {
    expect(formatCurrency(450_000)).toBe('$450,000');
  });

  it('renders an em dash for a non-finite value rather than "NaN"', () => {
    expect(formatCurrency(Number.NaN)).toBe('—');
    expect(formatCurrency(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatNumber', () => {
  it('groups thousands', () => {
    expect(formatNumber(1450)).toBe('1,450');
  });

  it('guards against NaN', () => {
    expect(formatNumber(Number.NaN)).toBe('—');
  });
});

describe('formatDate', () => {
  it('formats an ISO date in UTC so it does not shift across timezones', () => {
    expect(formatDate('2026-08-29')).toBe('Aug 29, 2026');
  });

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatRelativeDays', () => {
  it.each([
    ['2026-09-11', 'listed today'],
    ['2026-09-10', 'listed 1 day ago'],
    ['2026-09-04', 'listed 7 days ago'],
    ['2026-08-12', 'listed 1 month ago'],
  ])('describes %s as "%s"', (iso, expected) => {
    expect(formatRelativeDays(iso, NOW)).toBe(expected);
  });

  it('treats a future date as today rather than reporting negative days', () => {
    expect(formatRelativeDays('2027-01-01', NOW)).toBe('listed today');
  });

  it('returns an empty string for an unparseable date', () => {
    expect(formatRelativeDays('whenever', NOW)).toBe('');
  });
});

describe('formatBathrooms', () => {
  it('drops the decimal for whole numbers', () => {
    expect(formatBathrooms(2)).toBe('2');
  });

  it('keeps a single decimal for halves', () => {
    expect(formatBathrooms(1.5)).toBe('1.5');
  });
});
