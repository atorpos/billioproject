import type { PageMeta } from '@billio/shared';
import { Spinner } from './ui/Spinner.js';

export interface ResultsSummaryProps {
  meta: PageMeta;
  shownCount: number;
  isFetching: boolean;
}

/** One line telling the user exactly what they are looking at. */
export function ResultsSummary({ meta, shownCount, isFetching }: ResultsSummaryProps) {
  const firstIndex = shownCount === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const lastIndex = firstIndex === 0 ? 0 : firstIndex + shownCount - 1;

  return (
    <div className="results-summary">
      <p aria-live="polite">
        {meta.totalItems === 0 ? (
          'No matching listings'
        ) : (
          <>
            Showing <strong>{firstIndex}</strong>–<strong>{lastIndex}</strong> of{' '}
            <strong>{meta.totalItems}</strong> listings · page {meta.page} of {meta.totalPages}
          </>
        )}
        {meta.duplicatesCollapsed > 0 ? (
          <span className="results-summary__note">
            {' '}
            · {meta.duplicatesCollapsed} duplicate{meta.duplicatesCollapsed === 1 ? '' : 's'} merged
          </span>
        ) : null}
      </p>
      {isFetching ? <Spinner label="Updating results" /> : null}
    </div>
  );
}
