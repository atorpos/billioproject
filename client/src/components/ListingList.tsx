import type { RankedListing } from '@billio/shared';
import { ListingCard } from './ListingCard.js';

export interface ListingListProps {
  listings: RankedListing[];
  /** Index of the first item on this page within the full result set (0-based). */
  startIndex: number;
}

export function ListingList({ listings, startIndex }: ListingListProps) {
  return (
    <div className="listing-list">
      {listings.map((listing, index) => (
        <ListingCard key={listing.listingKey} listing={listing} rank={startIndex + index + 1} />
      ))}
    </div>
  );
}
