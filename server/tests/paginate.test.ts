import { describe, expect, it } from 'vitest';
import { planPagination } from '../src/domain/paginate.js';

describe('planPagination', () => {
  it('slices the first page', () => {
    const plan = planPagination({ page: 1, pageSize: 5, totalItems: 12 });
    expect([plan.start, plan.end]).toEqual([0, 5]);
    expect(plan.meta.totalPages).toBe(3);
    expect(plan.meta.hasPreviousPage).toBe(false);
    expect(plan.meta.hasNextPage).toBe(true);
  });

  it('slices a middle page', () => {
    const plan = planPagination({ page: 2, pageSize: 5, totalItems: 12 });
    expect([plan.start, plan.end]).toEqual([5, 10]);
    expect(plan.meta.hasPreviousPage).toBe(true);
    expect(plan.meta.hasNextPage).toBe(true);
  });

  it('truncates the final partial page to the available items', () => {
    const plan = planPagination({ page: 3, pageSize: 5, totalItems: 12 });
    expect([plan.start, plan.end]).toEqual([10, 12]);
    expect(plan.meta.hasNextPage).toBe(false);
  });

  it('handles a total that is an exact multiple of pageSize', () => {
    const plan = planPagination({ page: 2, pageSize: 5, totalItems: 10 });
    expect([plan.start, plan.end]).toEqual([5, 10]);
    expect(plan.meta.totalPages).toBe(2);
    expect(plan.meta.hasNextPage).toBe(false);
    expect(plan.meta.pageOutOfRange).toBe(false);
  });

  it('reports zero pages for an empty result set without flagging it out of range', () => {
    const plan = planPagination({ page: 1, pageSize: 5, totalItems: 0 });
    expect([plan.start, plan.end]).toEqual([0, 0]);
    expect(plan.meta.totalPages).toBe(0);
    expect(plan.meta.pageOutOfRange).toBe(false);
    expect(plan.meta.hasNextPage).toBe(false);
  });

  it('flags a page past the end and yields an empty, in-bounds slice', () => {
    const plan = planPagination({ page: 99, pageSize: 5, totalItems: 12 });
    expect(plan.meta.pageOutOfRange).toBe(true);
    expect(plan.end - plan.start).toBe(0);
    expect(plan.start).toBeLessThanOrEqual(12);
  });

  it('treats the last valid page as in range', () => {
    expect(planPagination({ page: 3, pageSize: 5, totalItems: 12 }).meta.pageOutOfRange).toBe(false);
    expect(planPagination({ page: 4, pageSize: 5, totalItems: 12 }).meta.pageOutOfRange).toBe(true);
  });

  it('puts every item on one page when pageSize exceeds the total', () => {
    const plan = planPagination({ page: 1, pageSize: 100, totalItems: 12 });
    expect([plan.start, plan.end]).toEqual([0, 12]);
    expect(plan.meta.totalPages).toBe(1);
  });

  it('defends against a non-positive pageSize reaching it', () => {
    const plan = planPagination({ page: 1, pageSize: 0, totalItems: 12 });
    expect(plan.meta.pageSize).toBe(1);
    expect(Number.isFinite(plan.meta.totalPages)).toBe(true);
    expect(plan.meta.totalPages).toBe(12);
  });

  it('defends against a page below 1 reaching it', () => {
    const plan = planPagination({ page: -4, pageSize: 5, totalItems: 12 });
    expect(plan.meta.page).toBe(1);
    expect([plan.start, plan.end]).toEqual([0, 5]);
  });
});
