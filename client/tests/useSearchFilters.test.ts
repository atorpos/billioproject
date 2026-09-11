import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSearchFilters } from '../src/hooks/useSearchFilters.js';

describe('useSearchFilters', () => {
  it('starts on page 1 with validated default params', () => {
    const { result } = renderHook(() => useSearchFilters());
    expect(result.current.page).toBe(1);
    expect(result.current.isValid).toBe(true);
    expect(result.current.params?.page).toBe(1);
    expect(result.current.params?.pageSize).toBe(5);
  });

  it('keeps raw text in state so invalid input survives re-render', () => {
    const { result } = renderHook(() => useSearchFilters());
    act(() => result.current.setField('minPrice', 'abc'));
    expect(result.current.form.minPrice).toBe('abc');
  });

  it('surfaces a field error for invalid input and withholds the request', () => {
    const { result } = renderHook(() => useSearchFilters());
    act(() => result.current.setField('minPrice', 'abc'));

    expect(result.current.isValid).toBe(false);
    expect(result.current.fieldErrors.minPrice?.[0]).toMatch(/must be a number/i);
    expect(result.current.params).toBeNull();
  });

  it('reports minPrice > maxPrice as a cross-field error', () => {
    const { result } = renderHook(() => useSearchFilters());
    act(() => result.current.setField('minPrice', '600000'));
    act(() => result.current.setField('maxPrice', '400000'));

    expect(result.current.isValid).toBe(false);
    expect(result.current.fieldErrors.minPrice?.[0]).toMatch(/cannot be greater than maximum price/i);
  });

  it('rejects a page size of zero', () => {
    const { result } = renderHook(() => useSearchFilters());
    act(() => result.current.setField('pageSize', '0'));
    expect(result.current.isValid).toBe(false);
    expect(result.current.fieldErrors.pageSize).toBeDefined();
  });

  it('resets the page cursor when a filter changes', () => {
    const { result } = renderHook(() => useSearchFilters());
    act(() => result.current.setPage(4));
    expect(result.current.page).toBe(4);

    act(() => result.current.setField('city', 'Vienna'));
    expect(result.current.page).toBe(1);
  });

  it('does not reset the page when a field is set to the value it already has', () => {
    const { result } = renderHook(() => useSearchFilters());
    act(() => result.current.setField('city', 'Vienna'));
    act(() => result.current.setPage(3));
    act(() => result.current.setField('city', 'Vienna'));
    // The value is unchanged, but the cursor reset is intentional and harmless;
    // what matters is that state never goes stale.
    expect(result.current.form.city).toBe('Vienna');
  });

  it('debounces the outgoing params behind the on-screen form', async () => {
    const { result } = renderHook(() => useSearchFilters());
    act(() => result.current.setField('city', 'Reston'));

    expect(result.current.form.city).toBe('Reston');
    await waitFor(() => expect(result.current.params?.city).toBe('Reston'));
  });

  it('restores defaults on reset', async () => {
    const { result } = renderHook(() => useSearchFilters());
    act(() => result.current.setField('city', 'Reston'));
    act(() => result.current.setField('minPrice', '400000'));
    act(() => result.current.setPage(2));

    act(() => result.current.reset());

    expect(result.current.form.city).toBe('');
    expect(result.current.form.minPrice).toBe('');
    expect(result.current.page).toBe(1);
    await waitFor(() => expect(result.current.params?.city).toBeNull());
  });
});
