import { useState } from 'react';
import type { RankedListing } from '@billio/shared';
import { Badge } from './ui/Badge.js';
import { Button } from './ui/Button.js';
import { ScoreBreakdownPanel } from './ScoreBreakdownPanel.js';
import { formatBathrooms, formatCurrency, formatDate, formatNumber, formatRelativeDays } from '../utils/format.js';

export interface ListingCardProps {
  listing: RankedListing;
  /** 1-based position within the whole result set, not just the page. */
  rank: number;
}

const STATUS_TONE = {
  active: 'positive',
  pending: 'warning',
  sold: 'muted',
} as const;

export function ListingCard({ listing, rank }: ListingCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <article className="card" aria-labelledby={`listing-${listing.listingKey}`}>
      <header className="card__header">
        <div>
          <span className="card__rank">#{rank}</span>
          <h3 className="card__title" id={`listing-${listing.listingKey}`}>
            {listing.address}
          </h3>
          <p className="card__sub">
            {[listing.city, listing.state, listing.zip].filter(Boolean).join(', ')}
          </p>
        </div>
        <div className="card__score">
          <span className="card__score-value">{listing.relevanceScore.toFixed(1)}</span>
          <span className="card__score-label">relevance</span>
        </div>
      </header>

      <p className="card__price">{formatCurrency(listing.price)}</p>

      <ul className="card__facts">
        <li>
          <strong>{formatNumber(listing.bedrooms)}</strong> bed
        </li>
        <li>
          <strong>{formatBathrooms(listing.bathrooms)}</strong> bath
        </li>
        <li>
          <strong>{formatNumber(listing.sqft)}</strong> sqft
        </li>
      </ul>

      <p className="card__description">{listing.description}</p>

      <div className="card__tags">
        <Badge tone={STATUS_TONE[listing.status]}>{listing.status}</Badge>
        <Badge tone="neutral">{listing.source}</Badge>
        <Badge tone="muted">
          {formatDate(listing.listedDate)} · {formatRelativeDays(listing.listedDate)}
        </Badge>
        {listing.duplicates.length > 0 ? (
          <Badge tone="warning">
            +{listing.duplicates.length} duplicate {listing.duplicates.length === 1 ? 'feed' : 'feeds'}
          </Badge>
        ) : null}
      </div>

      {listing.duplicates.length > 0 ? (
        <p className="card__duplicates">
          Also listed as{' '}
          {listing.duplicates
            .map((duplicate) => `${duplicate.listingKey} at ${formatCurrency(duplicate.price)}`)
            .join(', ')}
          .
        </p>
      ) : null}

      <footer className="card__footer">
        <Button
          variant="ghost"
          aria-expanded={showBreakdown}
          onClick={() => setShowBreakdown((open) => !open)}
        >
          {showBreakdown ? 'Hide score breakdown' : 'Why this score?'}
        </Button>
      </footer>

      {showBreakdown ? <ScoreBreakdownPanel breakdown={listing.breakdown} /> : null}
    </article>
  );
}
