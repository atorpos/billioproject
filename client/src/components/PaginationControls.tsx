import type { PageMeta } from '@billio/shared';
import { Button } from './ui/Button.js';

export interface PaginationControlsProps {
  meta: PageMeta;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

/** Builds a compact page list with ellipses: 1 … 4 [5] 6 … 12 */
export function buildPageWindow(current: number, total: number, radius = 1): Array<number | 'gap'> {
  if (total <= 0) return [];

  const pages = new Set<number>([1, total, current]);
  for (let offset = 1; offset <= radius; offset += 1) {
    if (current - offset >= 1) pages.add(current - offset);
    if (current + offset <= total) pages.add(current + offset);
  }

  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const output: Array<number | 'gap'> = [];

  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && page - previous > 1) output.push('gap');
    output.push(page);
  });

  return output;
}

export function PaginationControls({ meta, onPageChange, disabled = false }: PaginationControlsProps) {
  if (meta.totalPages <= 1) return null;

  const window = buildPageWindow(meta.page, meta.totalPages);

  return (
    <nav className="pagination" aria-label="Search results pages">
      <Button
        disabled={disabled || !meta.hasPreviousPage}
        onClick={() => onPageChange(meta.page - 1)}
      >
        ← Previous
      </Button>

      <ul className="pagination__pages">
        {window.map((entry, index) =>
          entry === 'gap' ? (
            <li aria-hidden="true" className="pagination__gap" key={`gap-${index}`}>
              …
            </li>
          ) : (
            <li key={entry}>
              <Button
                variant={entry === meta.page ? 'primary' : 'ghost'}
                aria-current={entry === meta.page ? 'page' : undefined}
                aria-label={`Page ${entry}`}
                disabled={disabled}
                onClick={() => onPageChange(entry)}
              >
                {entry}
              </Button>
            </li>
          ),
        )}
      </ul>

      <Button disabled={disabled || !meta.hasNextPage} onClick={() => onPageChange(meta.page + 1)}>
        Next →
      </Button>
    </nav>
  );
}
