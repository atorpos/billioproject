import type { FacetsResponse } from '@billio/shared';
import { LISTING_STATUSES, PAGINATION_LIMITS } from '@billio/shared';
import type { FilterFormState } from '../hooks/useSearchFilters.js';
import { Button } from './ui/Button.js';
import { Checkbox } from './ui/Checkbox.js';
import { NumberField } from './ui/NumberField.js';
import { SelectField } from './ui/SelectField.js';
import { TextField } from './ui/TextField.js';
import { formatCurrency } from '../utils/format.js';

export interface SearchFiltersProps {
  form: FilterFormState;
  fieldErrors: Record<string, string[]>;
  facets: FacetsResponse | null;
  onChange: <K extends keyof FilterFormState>(key: K, value: FilterFormState[K]) => void;
  onReset: () => void;
}

/**
 * The filter panel. Inputs are driven by facet data where possible (the city list
 * comes from the dataset), and validation messages come from the same parser the
 * API uses, so what the user sees inline is exactly what the server would reject.
 */
export function SearchFilters({ form, fieldErrors, facets, onChange, onReset }: SearchFiltersProps) {
  const priceHint = facets
    ? `Dataset range ${formatCurrency(facets.priceRange.min)} – ${formatCurrency(facets.priceRange.max)}`
    : undefined;

  return (
    <form className="filters" onSubmit={(event) => event.preventDefault()} aria-label="Listing filters">
      <div className="filters__row">
        <TextField
          label="Keyword"
          type="search"
          value={form.keyword}
          onChange={(value) => onChange('keyword', value)}
          placeholder="e.g. pet friendly garage"
          hint="Matches the description first, then address and city."
          errors={fieldErrors.keyword}
        />
      </div>

      <div className="filters__row filters__row--split">
        <NumberField
          label="Min price"
          value={form.minPrice}
          onChange={(value) => onChange('minPrice', value)}
          placeholder="0"
          min={0}
          step={1000}
          hint={priceHint}
          errors={fieldErrors.minPrice}
        />
        <NumberField
          label="Max price"
          value={form.maxPrice}
          onChange={(value) => onChange('maxPrice', value)}
          placeholder="No limit"
          min={0}
          step={1000}
          errors={fieldErrors.maxPrice}
        />
      </div>

      <div className="filters__row filters__row--split">
        <NumberField
          label="Min bedrooms"
          value={form.minBedrooms}
          onChange={(value) => onChange('minBedrooms', value)}
          placeholder="Any"
          min={0}
          step={1}
          errors={fieldErrors.minBedrooms}
        />
        {facets && facets.cities.length > 0 ? (
          <SelectField
            label="City"
            value={form.city}
            onChange={(value) => onChange('city', value)}
            options={facets.cities.map((city) => ({ value: city, label: city }))}
            placeholder="All cities"
            errors={fieldErrors.city}
          />
        ) : (
          <TextField
            label="City"
            value={form.city}
            onChange={(value) => onChange('city', value)}
            placeholder="All cities"
            errors={fieldErrors.city}
          />
        )}
      </div>

      <div className="filters__row filters__row--split">
        <NumberField
          label="Target budget"
          value={form.targetBudget}
          onChange={(value) => onChange('targetBudget', value)}
          placeholder="Not set"
          min={1}
          step={1000}
          hint="Drives relevance ranking. Listings near this price rank highest."
          errors={fieldErrors.targetBudget}
        />
        <SelectField
          label="Status"
          value={form.status}
          onChange={(value) => onChange('status', value)}
          options={(facets?.statuses ?? LISTING_STATUSES).map((status) => ({
            value: status,
            label: status,
          }))}
          placeholder="Any status"
          errors={fieldErrors.status}
        />
      </div>

      <div className="filters__row">
        <NumberField
          label="Results per page"
          value={form.pageSize}
          onChange={(value) => onChange('pageSize', value)}
          min={PAGINATION_LIMITS.minPageSize}
          max={PAGINATION_LIMITS.maxPageSize}
          step={1}
          hint={`Between ${PAGINATION_LIMITS.minPageSize} and ${PAGINATION_LIMITS.maxPageSize}.`}
          errors={fieldErrors.pageSize}
        />
      </div>

      <div className="filters__row">
        <Checkbox
          label="Merge duplicate listings"
          checked={form.dedupe}
          onChange={(checked) => onChange('dedupe', checked)}
          hint="The same property often appears in more than one feed."
        />
      </div>

      <div className="filters__actions">
        <Button variant="secondary" onClick={onReset}>
          Reset filters
        </Button>
      </div>
    </form>
  );
}
