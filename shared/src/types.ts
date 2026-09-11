/** A single listing exactly as it arrives from an MLS feed. */
export interface Listing {
  /** Unique per source, NOT unique across sources. Use `listingKey` for identity. */
  id: string;
  source: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  latitude: number;
  longitude: number;
  /** ISO date (YYYY-MM-DD) the listing went live. */
  listedDate: string;
  status: ListingStatus;
  description: string;
}

export const LISTING_STATUSES = ['active', 'pending', 'sold'] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** Per-component relevance contributions, surfaced so the UI can explain a score. */
export interface ScoreBreakdown {
  /** How well the price fits `targetBudget`. `null` when no budget was supplied. */
  budgetFit: number | null;
  /** Freshness of `listedDate`, decayed against "now". */
  recency: number;
  /** Share of keyword terms matched. `null` when no keyword was supplied. */
  keyword: number | null;
  /** Availability weighting (active > pending > sold). */
  status: number;
}

/** A reference to a listing that was collapsed into another as a near-duplicate. */
export interface DuplicateRef {
  listingKey: string;
  id: string;
  source: string;
  price: number;
  listedDate: string;
}

/** A listing enriched with its relevance score and duplicate provenance. */
export interface RankedListing extends Listing {
  /** Stable cross-feed identity: `${source}:${id}`. */
  listingKey: string;
  /** Relevance on a 0-100 scale, rounded to 2dp. */
  relevanceScore: number;
  breakdown: ScoreBreakdown;
  /** Listings from other feeds collapsed into this one. Empty when deduping is off. */
  duplicates: DuplicateRef[];
}

/** Fully validated, normalised search input. Every field has a concrete value. */
export interface SearchParams {
  minPrice: number | null;
  maxPrice: number | null;
  minBedrooms: number | null;
  city: string | null;
  keyword: string | null;
  status: ListingStatus | null;
  targetBudget: number | null;
  dedupe: boolean;
  page: number;
  pageSize: number;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  /** Number of listings matching the filters, before pagination. */
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  /** True when `page` sits past the last page of a non-empty result set. */
  pageOutOfRange: boolean;
  /** Listings removed because another feed carried the same property. */
  duplicatesCollapsed: number;
}

export interface SearchResponse {
  items: RankedListing[];
  meta: PageMeta;
  /** Echo of the params actually applied, so the UI can reconcile its own state. */
  appliedParams: SearchParams;
}

/** Facet data used to build real, data-driven inputs in the UI. */
export interface FacetsResponse {
  cities: string[];
  statuses: ListingStatus[];
  priceRange: { min: number; max: number };
  bedroomsRange: { min: number; max: number };
  totalListings: number;
}

export interface FieldIssue {
  field: string;
  message: string;
}

export type ApiErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'INTERNAL_ERROR';

/** The single error shape every failing endpoint returns. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    issues: FieldIssue[];
  };
}
