/** Shared text-normalisation helpers used by filtering, keyword scoring and dedupe. */

/** Lowercases, strips accents and punctuation, and collapses whitespace. */
export function normaliseText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits a free-text keyword box into distinct search terms. */
export function toTerms(keyword: string): string[] {
  const normalised = normaliseText(keyword);
  if (!normalised) return [];
  return [...new Set(normalised.split(' ').filter(Boolean))];
}

/** Common US street-suffix and unit-designator variants, mapped to one spelling. */
const ADDRESS_SYNONYMS: Record<string, string> = {
  street: 'st',
  avenue: 'ave',
  av: 'ave',
  road: 'rd',
  drive: 'dr',
  court: 'ct',
  lane: 'ln',
  boulevard: 'blvd',
  circle: 'cir',
  place: 'pl',
  terrace: 'ter',
  parkway: 'pkwy',
  highway: 'hwy',
  square: 'sq',
  trail: 'trl',
  way: 'way',
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
  northeast: 'ne',
  northwest: 'nw',
  southeast: 'se',
  southwest: 'sw',
  apartment: 'unit',
  apt: 'unit',
  suite: 'unit',
  ste: 'unit',
  no: 'unit',
  num: 'unit',
  '': '',
};

/**
 * Canonicalises a free-text street address so the same property written two ways
 * by two feeds ("123 Main St, Apt 4B" vs "123 Main Street, Unit 4B") collapses to
 * one string.
 */
export function normaliseAddress(address: string): string {
  return normaliseText(address)
    .split(' ')
    .map((token) => ADDRESS_SYNONYMS[token] ?? token)
    .filter(Boolean)
    .join(' ');
}

/** City names differ only by case/whitespace across the sample feeds. */
export function normaliseCity(city: string): string {
  return normaliseText(city);
}
