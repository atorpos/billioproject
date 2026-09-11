import type { Listing, ScoreBreakdown } from '@billio/shared';
import { normaliseText, toTerms } from './text.js';

/**
 * ============================ SCORING APPROACH ============================
 *
 * A listing's relevance is a weighted average of four independent components,
 * each normalised to 0..1, then reported on a 0..100 scale.
 *
 *   1. budgetFit (0.45) — how well the price matches `targetBudget`.
 *   2. recency   (0.30) — how recently the listing went live.
 *   3. keyword   (0.20) — share of the user's search terms the listing matches.
 *   4. status    (0.05) — how actually buyable the listing is.
 *
 * Components that the user gave no input for are *dropped and the remaining
 * weights renormalised*, rather than being scored as a neutral 0.5. Scoring an
 * absent signal at a constant would drag every listing toward the middle and
 * compress the spread between good and bad matches; dropping it keeps the
 * surviving signals at full resolution. So with no budget and no keyword, the
 * ranking is purely recency + status, which is the sensible default ordering.
 *
 * Weights are exported and injectable so they can be tuned (or A/B tested)
 * without touching the maths.
 * ========================================================================= */

export interface ScoringWeights {
  budgetFit: number;
  recency: number;
  keyword: number;
  status: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  budgetFit: 0.45,
  recency: 0.3,
  keyword: 0.2,
  status: 0.05,
};

export const SCORING_CONSTANTS = {
  /** Price this fraction over budget scores 0 on budget fit. */
  overBudgetTolerance: 0.25,
  /** Maximum penalty applied to a listing far below budget. */
  underBudgetPenalty: 0.25,
  /** Being this fraction under budget incurs the full under-budget penalty. */
  underBudgetRange: 0.4,
  /** Days after which a listing's recency score halves. */
  recencyHalfLifeDays: 30,
  /** Extra credit for matching a term in the description rather than elsewhere. */
  descriptionMatchShare: 0.7,
} as const;

const STATUS_SCORES: Record<string, number> = {
  active: 1,
  pending: 0.4,
  sold: 0,
};

const MS_PER_DAY = 86_400_000;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Budget fit peaks at exactly the target budget.
 *
 * Over budget is punished steeply and linearly: 25% over target scores 0, because
 * a buyer with a hard budget genuinely cannot transact above it.
 *
 * Under budget is punished *mildly* (max 25%), on the assumption that a buyer
 * quoting a budget wants the most house that budget buys — a $250k listing is a
 * weaker answer to "my budget is $500k" than a $480k one, but it is not useless,
 * so it must not be pushed below an over-budget listing.
 */
export function scoreBudgetFit(price: number, targetBudget: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(targetBudget) || targetBudget <= 0) return 0;

  const delta = (price - targetBudget) / targetBudget;
  if (delta > 0) {
    return clamp01(1 - delta / SCORING_CONSTANTS.overBudgetTolerance);
  }
  const under = Math.min(1, -delta / SCORING_CONSTANTS.underBudgetRange);
  return clamp01(1 - SCORING_CONSTANTS.underBudgetPenalty * under);
}

/**
 * Exponential decay with a 30-day half-life: today scores 1.0, 30 days old 0.5,
 * 60 days old 0.25. Exponential rather than linear because the difference between
 * "today" and "a week ago" matters far more to a buyer than the difference between
 * "six months" and "seven months". Future-dated listings are clamped to 1.0.
 */
export function scoreRecency(listedDate: string, now: Date): number {
  const listed = Date.parse(listedDate);
  if (Number.isNaN(listed)) return 0;

  const ageDays = Math.max(0, (now.getTime() - listed) / MS_PER_DAY);
  return clamp01(0.5 ** (ageDays / SCORING_CONSTANTS.recencyHalfLifeDays));
}

/**
 * Share of the user's terms the listing matches. A term found in the description
 * counts fully; a term found only in the address/city counts for less, because the
 * brief defines the keyword as a description search and location has its own filter.
 */
export function scoreKeyword(listing: Listing, terms: string[]): number {
  if (terms.length === 0) return 0;

  const description = normaliseText(listing.description);
  const elsewhere = normaliseText(`${listing.address} ${listing.city} ${listing.state} ${listing.zip}`);

  const total = terms.reduce((sum, term) => {
    if (description.includes(term)) return sum + 1;
    if (elsewhere.includes(term)) return sum + SCORING_CONSTANTS.descriptionMatchShare;
    return sum;
  }, 0);

  return clamp01(total / terms.length);
}

/** Availability weighting — a sold listing is not a result the buyer can act on. */
export function scoreStatus(status: string): number {
  return STATUS_SCORES[status] ?? 0;
}

export interface ScoreContext {
  targetBudget: number | null;
  keyword: string | null;
  now: Date;
  weights?: ScoringWeights;
}

export interface ScoreResult {
  score: number;
  breakdown: ScoreBreakdown;
}

/**
 * Combines the active components into a 0-100 score.
 *
 * `now` is injected rather than read from the clock so scoring is a pure function:
 * the same inputs always produce the same score, which is what makes it testable.
 */
export function scoreListing(listing: Listing, context: ScoreContext): ScoreResult {
  const weights = context.weights ?? DEFAULT_WEIGHTS;
  const terms = context.keyword ? toTerms(context.keyword) : [];

  const budgetFit = context.targetBudget !== null ? scoreBudgetFit(listing.price, context.targetBudget) : null;
  const keyword = terms.length > 0 ? scoreKeyword(listing, terms) : null;
  const recency = scoreRecency(listing.listedDate, context.now);
  const status = scoreStatus(listing.status);

  const active: Array<[number, number]> = [
    [recency, weights.recency],
    [status, weights.status],
  ];
  if (budgetFit !== null) active.push([budgetFit, weights.budgetFit]);
  if (keyword !== null) active.push([keyword, weights.keyword]);

  const totalWeight = active.reduce((sum, [, weight]) => sum + weight, 0);
  const weighted = active.reduce((sum, [value, weight]) => sum + value * weight, 0);
  const score = totalWeight > 0 ? weighted / totalWeight : 0;

  return {
    score: roundTo(clamp01(score) * 100, 2),
    breakdown: {
      budgetFit: budgetFit === null ? null : roundTo(budgetFit, 4),
      recency: roundTo(recency, 4),
      keyword: keyword === null ? null : roundTo(keyword, 4),
      status: roundTo(status, 4),
    },
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
