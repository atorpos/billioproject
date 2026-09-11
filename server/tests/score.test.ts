import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  SCORING_CONSTANTS,
  scoreBudgetFit,
  scoreKeyword,
  scoreListing,
  scoreRecency,
  scoreStatus,
} from '../src/domain/score.js';
import { toTerms } from '../src/domain/text.js';
import { makeListing, NOW } from './fixtures.js';

describe('scoreBudgetFit', () => {
  it('scores a listing exactly at budget as a perfect fit', () => {
    expect(scoreBudgetFit(500_000, 500_000)).toBe(1);
  });

  it('scores zero at the over-budget tolerance', () => {
    const atTolerance = 500_000 * (1 + SCORING_CONSTANTS.overBudgetTolerance);
    expect(scoreBudgetFit(atTolerance, 500_000)).toBe(0);
  });

  it('never returns a negative score, however far over budget', () => {
    expect(scoreBudgetFit(50_000_000, 500_000)).toBe(0);
  });

  it('penalises over budget far more steeply than the same distance under', () => {
    const over = scoreBudgetFit(550_000, 500_000);
    const under = scoreBudgetFit(450_000, 500_000);
    expect(under).toBeGreaterThan(over);
  });

  it('caps the under-budget penalty so cheap listings stay competitive', () => {
    const floor = 1 - SCORING_CONSTANTS.underBudgetPenalty;
    expect(scoreBudgetFit(1, 500_000)).toBeCloseTo(floor, 6);
    expect(scoreBudgetFit(100_000, 500_000)).toBeGreaterThanOrEqual(floor);
  });

  it('prefers the listing closer to budget when both are under it', () => {
    expect(scoreBudgetFit(480_000, 500_000)).toBeGreaterThan(scoreBudgetFit(300_000, 500_000));
  });

  it('returns 0 for a non-positive or non-finite budget rather than dividing by zero', () => {
    expect(scoreBudgetFit(400_000, 0)).toBe(0);
    expect(scoreBudgetFit(400_000, Number.NaN)).toBe(0);
    expect(scoreBudgetFit(Number.NaN, 400_000)).toBe(0);
  });
});

describe('scoreRecency', () => {
  it('scores a listing published today as 1', () => {
    expect(scoreRecency('2026-09-11', NOW)).toBe(1);
  });

  it('halves the score after exactly one half-life', () => {
    expect(scoreRecency('2026-08-12', NOW)).toBeCloseTo(0.5, 6);
  });

  it('quarters the score after two half-lives', () => {
    expect(scoreRecency('2026-07-13', NOW)).toBeCloseTo(0.25, 6);
  });

  it('clamps future-dated listings to 1 instead of exceeding it', () => {
    expect(scoreRecency('2027-01-01', NOW)).toBe(1);
  });

  it('returns 0 for an unparseable date rather than NaN', () => {
    expect(scoreRecency('not-a-date', NOW)).toBe(0);
  });
});

describe('scoreKeyword', () => {
  const listing = makeListing({
    description: 'Bright top-floor condo near shops and transit. Pet friendly.',
    address: '123 Main St, Apt 4B',
    city: 'Springfield',
  });

  it('scores 1 when every term is in the description', () => {
    expect(scoreKeyword(listing, toTerms('condo transit'))).toBe(1);
  });

  it('scores a partial match proportionally', () => {
    expect(scoreKeyword(listing, toTerms('condo garage'))).toBeCloseTo(0.5, 6);
  });

  it('scores 0 when nothing matches', () => {
    expect(scoreKeyword(listing, toTerms('basement garage'))).toBe(0);
  });

  it('weights an address-only match below a description match', () => {
    const description = scoreKeyword(listing, toTerms('condo'));
    const addressOnly = scoreKeyword(listing, toTerms('springfield'));
    expect(addressOnly).toBeLessThan(description);
    expect(addressOnly).toBeCloseTo(SCORING_CONSTANTS.descriptionMatchShare, 6);
  });

  it('is case- and punctuation-insensitive', () => {
    expect(scoreKeyword(listing, toTerms('PET-FRIENDLY!'))).toBe(1);
  });

  it('scores 0 for an empty term list', () => {
    expect(scoreKeyword(listing, [])).toBe(0);
  });
});

describe('scoreStatus', () => {
  it('ranks active above pending above sold', () => {
    expect(scoreStatus('active')).toBeGreaterThan(scoreStatus('pending'));
    expect(scoreStatus('pending')).toBeGreaterThan(scoreStatus('sold'));
  });

  it('treats an unknown status as unbuyable', () => {
    expect(scoreStatus('withdrawn')).toBe(0);
  });
});

describe('scoreListing', () => {
  const base = { now: NOW, weights: DEFAULT_WEIGHTS };

  it('reports a score on a 0-100 scale', () => {
    const { score } = scoreListing(makeListing(), { ...base, targetBudget: 500_000, keyword: null });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('marks absent components as null in the breakdown instead of faking a value', () => {
    const { breakdown } = scoreListing(makeListing(), { ...base, targetBudget: null, keyword: null });
    expect(breakdown.budgetFit).toBeNull();
    expect(breakdown.keyword).toBeNull();
    expect(breakdown.recency).toBeGreaterThan(0);
  });

  it('renormalises weights so an absent component does not drag the score down', () => {
    const listing = makeListing({ listedDate: '2026-09-11', status: 'active' });
    // Perfect recency + perfect status and nothing else supplied must score 100,
    // not 35 (which is what an un-renormalised weighted sum would produce).
    const { score } = scoreListing(listing, { ...base, targetBudget: null, keyword: null });
    expect(score).toBe(100);
  });

  it('ranks an on-budget listing above an over-budget one, all else equal', () => {
    const onBudget = makeListing({ price: 500_000 });
    const overBudget = makeListing({ price: 600_000 });
    const context = { ...base, targetBudget: 500_000, keyword: null };
    expect(scoreListing(onBudget, context).score).toBeGreaterThan(scoreListing(overBudget, context).score);
  });

  it('ranks a newer listing above an older one, all else equal', () => {
    const fresh = makeListing({ listedDate: '2026-09-10' });
    const stale = makeListing({ listedDate: '2026-05-10' });
    const context = { ...base, targetBudget: 500_000, keyword: null };
    expect(scoreListing(fresh, context).score).toBeGreaterThan(scoreListing(stale, context).score);
  });

  it('is a pure function of its inputs', () => {
    const listing = makeListing();
    const context = { ...base, targetBudget: 450_000, keyword: 'pleasant' };
    expect(scoreListing(listing, context)).toEqual(scoreListing(listing, context));
  });

  it('honours injected weights', () => {
    const listing = makeListing({ price: 900_000, listedDate: '2026-09-11' });
    const budgetHeavy = scoreListing(listing, {
      now: NOW,
      targetBudget: 400_000,
      keyword: null,
      weights: { budgetFit: 1, recency: 0, keyword: 0, status: 0 },
    });
    expect(budgetHeavy.score).toBe(0);
  });
});
