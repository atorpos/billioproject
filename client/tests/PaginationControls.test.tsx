import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PageMeta } from '@billio/shared';
import { buildPageWindow, PaginationControls } from '../src/components/PaginationControls.js';

function meta(overrides: Partial<PageMeta> = {}): PageMeta {
  const page = overrides.page ?? 1;
  const totalPages = overrides.totalPages ?? 5;
  return {
    page,
    pageSize: 5,
    totalItems: totalPages * 5,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    pageOutOfRange: false,
    duplicatesCollapsed: 0,
    ...overrides,
  };
}

describe('buildPageWindow', () => {
  it('lists every page when there are few', () => {
    expect(buildPageWindow(1, 3)).toEqual([1, 2, 3]);
  });

  it('inserts a gap when pages are skipped', () => {
    expect(buildPageWindow(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12]);
  });

  it('never emits a gap for a single skipped page', () => {
    expect(buildPageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('clamps at the first and last page', () => {
    expect(buildPageWindow(1, 10)).toEqual([1, 2, 'gap', 10]);
    expect(buildPageWindow(10, 10)).toEqual([1, 'gap', 9, 10]);
  });

  it('returns nothing for a zero-page result set', () => {
    expect(buildPageWindow(1, 0)).toEqual([]);
  });
});

describe('PaginationControls', () => {
  it('renders nothing when everything fits on one page', () => {
    const { container } = render(
      <PaginationControls meta={meta({ page: 1, totalPages: 1 })} onPageChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('marks the current page for assistive technology', () => {
    render(<PaginationControls meta={meta({ page: 3 })} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page');
  });

  it('disables Previous on the first page and Next on the last', () => {
    const { unmount } = render(<PaginationControls meta={meta({ page: 1 })} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
    unmount();

    render(<PaginationControls meta={meta({ page: 5 })} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('reports the page the user asked for', async () => {
    const onPageChange = vi.fn();
    render(<PaginationControls meta={meta({ page: 2 })} onPageChange={onPageChange} />);

    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await userEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);

    await userEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('blocks page changes while a request is in flight', async () => {
    const onPageChange = vi.fn();
    render(<PaginationControls meta={meta({ page: 2 })} onPageChange={onPageChange} disabled />);

    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
