import { useCallback, useMemo, useState } from 'react';
import type { SearchParams } from '@billio/shared';
import { issuesByField, parseSearchParams, PAGINATION_LIMITS } from '@billio/shared';
import { useDebouncedValue } from './useDebouncedValue.js';

/**
 * Every filter is held as the raw string the user typed. Coercing to numbers in
 * state would quietly discard invalid input ("abc", "50-", minPrice > maxPrice),
 * and the brief asks for that input to be handled deliberately — which means it
 * has to survive long enough to be validated and reported.
 */
export interface FilterFormState {
  minPrice: string;
  maxPrice: string;
  minBedrooms: string;
  city: string;
  keyword: string;
  status: string;
  targetBudget: string;
  pageSize: string;
  dedupe: boolean;
}

export const INITIAL_FORM: FilterFormState = {
  minPrice: '',
  maxPrice: '',
  minBedrooms: '',
  city: '',
  keyword: '',
  status: '',
  targetBudget: '',
  pageSize: String(PAGINATION_LIMITS.defaultPageSize),
  dedupe: true,
};

export interface UseSearchFiltersResult {
  form: FilterFormState;
  page: number;
  setField: <K extends keyof FilterFormState>(key: K, value: FilterFormState[K]) => void;
  setPage: (page: number) => void;
  reset: () => void;
  /** Per-field validation messages for the value currently on screen. */
  fieldErrors: Record<string, string[]>;
  isValid: boolean;
  /**
   * Debounced, validated params ready to send — or `null` while the form is
   * invalid, in which case no request is made at all.
   */
  params: SearchParams | null;
}

/**
 * Owns filter state, validation and the page cursor.
 *
 * Validation reuses the exact parser the API uses, so the inline messages the user
 * sees are guaranteed to match what the server would have said.
 */
export function useSearchFilters(initial: FilterFormState = INITIAL_FORM): UseSearchFiltersResult {
  const [form, setForm] = useState<FilterFormState>(initial);
  const [page, setPage] = useState(1);

  const setField = useCallback(
    <K extends keyof FilterFormState>(key: K, value: FilterFormState[K]) => {
      setForm((current) => (current[key] === value ? current : { ...current, [key]: value }));
      // Any filter change invalidates the current page cursor: page 4 of the old
      // result set is meaningless against the new one.
      setPage(1);
    },
    [],
  );

  const reset = useCallback(() => {
    setForm(initial);
    setPage(1);
  }, [initial]);

  // Validate what is on screen right now, for immediate inline feedback.
  const liveValidation = useMemo(() => parseSearchParams({ ...form, page }), [form, page]);

  // Debounce the request itself so typing does not spam the API.
  const debouncedForm = useDebouncedValue(form, 300);
  const requestValidation = useMemo(
    () => parseSearchParams({ ...debouncedForm, page }),
    [debouncedForm, page],
  );

  return {
    form,
    page,
    setField,
    setPage,
    reset,
    fieldErrors: liveValidation.ok ? {} : issuesByField(liveValidation.issues),
    isValid: liveValidation.ok,
    // Both gates must pass: the debounced value is what we would send, but if the
    // form on screen is *already* invalid there is no point sending the older,
    // still-valid value — the user has moved on from it.
    params: liveValidation.ok && requestValidation.ok ? requestValidation.params : null,
  };
}
