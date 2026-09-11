import { ListingList } from './components/ListingList.js';
import { PaginationControls } from './components/PaginationControls.js';
import { ResultsSummary } from './components/ResultsSummary.js';
import { SearchFilters } from './components/SearchFilters.js';
import { Button } from './components/ui/Button.js';
import { Spinner } from './components/ui/Spinner.js';
import { StatusMessage } from './components/ui/StatusMessage.js';
import { useFacets } from './hooks/useFacets.js';
import { useListingSearch } from './hooks/useListingSearch.js';
import { useSearchFilters } from './hooks/useSearchFilters.js';

export function App() {
  const { form, setField, setPage, reset, fieldErrors, isValid, params } = useSearchFilters();
  const { facets } = useFacets();
  const { data, status, error, isFetching, retry } = useListingSearch(params);

  const meta = data?.meta ?? null;

  return (
    <div className="app">
      <header className="app__header">
        <h1>Listing search</h1>
        <p>
          Filtered, de-duplicated and relevance-ranked results across every MLS feed
          {facets ? ` · ${facets.totalListings} listings indexed` : ''}.
        </p>
      </header>

      <div className="app__layout">
        <aside className="app__sidebar">
          <SearchFilters
            form={form}
            fieldErrors={fieldErrors}
            facets={facets}
            onChange={setField}
            onReset={reset}
          />
        </aside>

        <main className="app__results">
          {/* Invalid input never reaches the network: the form explains itself instead. */}
          {!isValid ? (
            <StatusMessage
              tone="error"
              title="Check your filters"
              description={
                <ul className="status__list">
                  {Object.entries(fieldErrors).map(([field, messages]) => (
                    <li key={field}>{messages.join(' ')}</li>
                  ))}
                </ul>
              }
              action={
                <Button variant="secondary" onClick={reset}>
                  Reset filters
                </Button>
              }
            />
          ) : null}

          {isValid && status === 'error' && error ? (
            <StatusMessage
              tone="error"
              title="Search failed"
              description={
                <>
                  <p>{error.message}</p>
                  {error.issues.length > 0 ? (
                    <ul className="status__list">
                      {error.issues.map((issue) => (
                        <li key={`${issue.field}-${issue.message}`}>
                          <strong>{issue.field}:</strong> {issue.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              }
              action={
                <Button variant="primary" onClick={retry}>
                  Try again
                </Button>
              }
            />
          ) : null}

          {isValid && status === 'loading' && !data ? (
            <div className="app__loading">
              <Spinner label="Searching listings…" />
            </div>
          ) : null}

          {isValid && data && meta && status !== 'error' ? (
            <>
              <ResultsSummary meta={meta} shownCount={data.items.length} isFetching={isFetching} />

              {meta.pageOutOfRange ? (
                <StatusMessage
                  tone="info"
                  title={`Page ${meta.page} is past the last page`}
                  description={`There ${meta.totalPages === 1 ? 'is' : 'are'} only ${meta.totalPages} page${
                    meta.totalPages === 1 ? '' : 's'
                  } of results for these filters.`}
                  action={
                    <Button variant="primary" onClick={() => setPage(meta.totalPages)}>
                      Go to page {meta.totalPages}
                    </Button>
                  }
                />
              ) : null}

              {!meta.pageOutOfRange && meta.totalItems === 0 ? (
                <StatusMessage
                  tone="empty"
                  title="No listings match these filters"
                  description="Try widening the price range, lowering the bedroom minimum, or clearing the keyword."
                  action={
                    <Button variant="secondary" onClick={reset}>
                      Reset filters
                    </Button>
                  }
                />
              ) : null}

              {data.items.length > 0 ? (
                <div className={isFetching ? 'app__list app__list--stale' : 'app__list'}>
                  <ListingList listings={data.items} startIndex={(meta.page - 1) * meta.pageSize} />
                </div>
              ) : null}

              <PaginationControls meta={meta} onPageChange={setPage} disabled={isFetching} />
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
