import { Router } from 'express';
import { parseSearchParams } from '@billio/shared';
import type { ListingsRepository } from '../data/listings-repository.js';
import { searchListings } from '../domain/search.js';
import { ApiError } from '../http/errors.js';

export function createListingsRouter(repository: ListingsRepository): Router {
  const router = Router();

  /** Data-driven inputs for the UI (city list, price bounds, available statuses). */
  router.get('/facets', (_req, res) => {
    res.json(repository.facets());
  });

  /**
   * GET /api/listings/search
   *
   * Every query parameter is optional; each is validated by the shared parser and
   * an invalid request returns 400 with per-field issues rather than guessing.
   */
  router.get('/search', (req, res) => {
    const parsed = parseSearchParams(req.query as Record<string, unknown>);
    if (!parsed.ok) {
      throw ApiError.validation(parsed.issues);
    }

    res.json(searchListings(repository.all(), parsed.params));
  });

  return router;
}
