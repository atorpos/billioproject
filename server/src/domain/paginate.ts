import type { PageMeta } from '@billio/shared';

export interface PaginationInput {
  page: number;
  pageSize: number;
  totalItems: number;
}

export interface PaginationPlan {
  /** Zero-based slice start. */
  start: number;
  /** Exclusive slice end. */
  end: number;
  meta: Omit<PageMeta, 'duplicatesCollapsed'>;
}

/**
 * Pure pagination maths, kept separate from the data so the boundary cases
 * (empty set, exact multiple of pageSize, page past the end) are directly testable.
 *
 * A page beyond the last page is NOT an error — the user may simply have deleted a
 * filter. It returns an empty page plus `pageOutOfRange: true`, which the UI turns
 * into an explicit "page N is past the last page" message with a jump-to-last
 * action, rather than an unexplained empty list.
 */
export function planPagination({ page, pageSize, totalItems }: PaginationInput): PaginationPlan {
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const safePage = Math.max(1, Math.trunc(page));
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / safePageSize);

  const start = (safePage - 1) * safePageSize;
  const end = Math.min(start + safePageSize, totalItems);
  const pageOutOfRange = totalItems > 0 && safePage > totalPages;

  return {
    start: Math.min(start, totalItems),
    end: Math.max(Math.min(start, totalItems), end),
    meta: {
      page: safePage,
      pageSize: safePageSize,
      totalItems,
      totalPages,
      hasPreviousPage: safePage > 1,
      hasNextPage: safePage < totalPages,
      pageOutOfRange,
    },
  };
}
