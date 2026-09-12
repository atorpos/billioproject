# Listing Search

A full-stack property search over multi-feed MLS listings: real filtering, a
relevance ranking you can inspect, and pagination — wired end to end.

- **API** — Express + TypeScript. Owns all search logic.
- **Client** — React 18 + TypeScript, function components and hooks throughout.
- **Shared** — types and the search-parameter validator, used by *both* tiers.

---

## Running it

```bash
npm install

# Dev: API on :4000, Vite dev server on :5173 (proxies /api to the API)
npm run dev
#   → open http://localhost:5173

npm test          # 207 tests across shared / server / client
npm run typecheck # strict tsc over all three workspaces
```

For the production build, see [Shipping to production](#shipping-to-production).

The dataset (`data/sample_listings.json`, 12 listings) is loaded into memory at
startup. `ListingsRepository` is the only thing that knows that — swapping in a
database means replacing that one class.

---

## Shipping to production

```bash
npm ci
npm run build     # typecheck → client bundle → server bundle
npm start         # node server/dist/index.js
#   → open http://localhost:4000
```

`npm run build` produces two artifacts and nothing else is needed to run:

| Artifact | Built by | What it is |
|---|---|---|
| `client/dist/` | Vite | Hashed, minified static assets |
| `server/dist/index.js` | esbuild | The whole API as one ESM file (~22 kB) |

**The server bundle contains no TypeScript and needs no build toolchain to run.**
`@billio/shared` is a source-only workspace package that is never published, so it
is bundled *in*; `express` and `cors` stay external and are installed from the
lockfile, which keeps CJS-heavy dependencies loading exactly as they normally do.
[`server/build.mjs`](server/build.mjs) reads the externals straight from
`server/package.json`, so a new dependency cannot fall out of sync with it.

In production the API serves the built client from the same origin, so the whole
thing is one process on one port.

### To ship it, you need exactly

```
package.json  package-lock.json     # + each workspace's package.json
node_modules/                       # npm ci --omit=dev  (~6 MB: express, cors)
server/dist/                        # the API bundle
client/dist/                        # the static client
data/sample_listings.json           # the dataset
```

Then `node server/dist/index.js`.

### Container

```bash
docker build -t listing-search .
docker run --rm -p 4000:4000 listing-search
```

The [`Dockerfile`](Dockerfile) is a two-stage build: the first stage runs the full
typecheck and both bundles, the second copies only the two build outputs, the
dataset, and production-only dependencies into a clean `node:22-alpine` image. It
runs as the non-root `node` user, declares a `HEALTHCHECK` against `/api/health`,
and uses an exec-form `CMD` (no npm wrapper) so the process receives `SIGTERM`
directly and can drain in-flight requests.

### Configuration

All optional — the defaults are what you want for a single-process deployment.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Listen port |
| `HOST` | `0.0.0.0` | Listen address (`0.0.0.0` so containers are reachable) |
| `CORS_ORIGIN` | *unset* | Comma-separated allowed origins, or `*`. See below |
| `CLIENT_DIST_PATH` | auto-detected | Override the built client's location |
| `LISTINGS_DATA_PATH` | auto-detected | Override the dataset's location |

**CORS is off by default and that is deliberate.** The client is served from the
same origin in production, and the Vite dev server proxies `/api` in development,
so neither case needs it. Set `CORS_ORIGIN` only when hosting the client
separately — shipping a wide-open `Access-Control-Allow-Origin: *` because it was
convenient in development is how APIs end up publicly readable by any page.

Path auto-detection walks up from the running module rather than assuming a fixed
depth, because the server runs from `server/src/**` under tsx in development and
from a single `server/dist/index.js` in production. A hard-coded `../../..` works
in one layout and silently breaks in the other.

### What production mode does that dev mode doesn't

- Serves `/assets` (Vite fingerprints those filenames) with `immutable, max-age=1y`,
  while `index.html` is `max-age=0` — otherwise browsers keep requesting the
  previous deploy's asset URLs.
- Handles `SIGTERM`/`SIGINT` by closing the listener so in-flight requests finish,
  with a 10s hard-exit backstop.
- Drops the `X-Powered-By` header.

---

## Scoring approach

> The full rationale also lives next to the code, in the comment block at the top
> of [`server/src/domain/score.ts`](server/src/domain/score.ts).

A listing's relevance is a **weighted average of four independent components**,
each normalised to `0..1`, reported on a `0..100` scale.

| Component | Weight | What it measures |
|---|---|---|
| `budgetFit` | 0.45 | How well `price` matches the user's `targetBudget` |
| `recency` | 0.30 | How recently the listing went live |
| `keyword` | 0.20 | Share of the user's search terms the listing matches |
| `status` | 0.05 | How actually buyable it is (active > pending > sold) |

### 1. Budget fit — asymmetric on purpose

Peaks at exactly the target budget, and falls off differently in each direction:

- **Over budget** is punished steeply and linearly. 25% over target scores `0`,
  because a buyer with a hard budget genuinely cannot transact above it.
- **Under budget** is punished only mildly — capped at a 25% deduction. A buyer
  quoting a budget usually wants the most house that budget buys, so a $250k
  listing is a weaker answer to "my budget is $500k" than a $480k one. But it is
  not *useless*, and it must never rank below something they cannot afford.

Symmetric scoring was the obvious first move and it is wrong: it treats "$50k
cheaper than you asked" as exactly as bad as "$50k more than you can pay".

### 2. Recency — exponential, 30-day half-life

Today scores `1.0`, 30 days old `0.5`, 60 days old `0.25`. Exponential rather
than linear because the gap between "today" and "last week" matters far more to a
buyer than the gap between "six months" and "seven months". Future-dated listings
clamp to `1.0` rather than exceeding it.

### 3. Keyword — graded, not binary

The filter uses OR semantics (see trade-offs); the score then grades *how well*
each surviving listing matched. A term found in the `description` counts fully; a
term found only in the address/city counts `0.7`, since the brief defines the
keyword as a description search and location already has its own filter.

### 4. Status — a small availability tiebreak

`active` = 1.0, `pending` = 0.4, `sold` = 0. Deliberately low-weighted: it breaks
ties between otherwise comparable listings without letting availability override
a much better price or a much fresher listing.

### Absent components are dropped, not neutralised

If the user supplies no `targetBudget`, `budgetFit` is **removed and the remaining
weights renormalised** — it is not scored as a neutral `0.5`.

Scoring an absent signal at a constant drags every listing toward the middle and
compresses the spread between good and bad matches. Dropping it keeps the
surviving signals at full resolution. With no budget and no keyword, ranking is
purely recency + availability, which is the sensible default ordering.

The API returns the per-component `breakdown` with every listing, and the UI
renders it behind a "Why this score?" toggle — including which components were
excluded and why. A ranking nobody can explain is a ranking nobody trusts.

### Ties are broken deterministically

Scores are rounded to 2dp and the feeds carry near-identical properties, so ties
are common. Ordering falls through: **score desc → `listedDate` desc → `source:id`
asc**. Without that final stable key, the same listing could appear on both page 1
and page 2 of the same result set.

---

## Handling invalid input

Validation lives in `shared/src/search-params.ts` and runs in **both** tiers — the
client for instant inline feedback, the server because it never trusts a client.
One parser means the message the user sees is exactly what the server would say.

| Input | Behaviour |
|---|---|
| `minPrice` > `maxPrice` | `400` + field issue on `minPrice`; client blocks the request entirely |
| `pageSize` ≤ 0, or > 100 | `400` + field issue on `pageSize` |
| `page` < 1 | `400` + field issue on `page` |
| Non-numeric / `Infinity` price | `400`, not a silent `NaN` through the maths |
| Fractional `minBedrooms` | `400` — "must be a whole number" |
| Unknown `status` | `400` listing the valid values, rather than ignoring the filter |
| Repeated param (`?city=A&city=B`) | `400` — guessing the user's intent is how wrong data gets returned |
| City with no matches | `200`, empty items, `totalItems: 0`, and an explicit "no listings match" panel |
| `page` past the last page | `200`, empty items, `pageOutOfRange: true`, and a "go to page N" action |
| API unreachable / 500 | Error panel naming the problem, plus a working **Try again** |

Every field is checked before returning, so the user sees *all* their mistakes at
once instead of fixing them one reload at a time. Errors share one shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "issues": [ { "field": "minPrice", "message": "…" } ] } }
```

A page past the end is deliberately **not** an error — the user may just have
removed a filter. It is a state the UI explains and offers a way out of.

---

## Trade-offs

**Keyword filtering uses OR, not AND.** A query like `pet friendly garage` under
AND semantics returns nothing, which is a bad answer to a reasonable question. So
the filter lets through anything matching *at least one* term and the keyword
score pushes listings matching more terms to the top. The cost is a longer result
set; the benefit is that relevance ranking does the work instead of the user
guessing which words to delete. With a larger corpus I would add an explicit
"match all terms" toggle rather than change the default.

**Near-duplicates are merged by a deterministic key, not fuzzy matching.** The
sample data deliberately carries the same property from two feeds with different
address formatting, price, and even ZIP (`A1`/`B7`, `A2`/`B8`, `A3`/`B9`,
`A5`/`B11`). The key is normalised address + city + state + bedrooms + a 25-sqft
bucket, with a coordinate check to stop key collisions merging genuinely different
properties. ZIP is excluded precisely because the feeds disagree on it.

Real string-similarity matching (Levenshtein, token-set ratio) would catch more
cases, but it is slower and much harder to reason about in tests. The cheap key
catches every duplicate in this dataset and is fully deterministic. It is exposed
as a UI toggle so its effect is visible rather than mysterious — the header shows
"4 duplicates merged", and each merged card lists what it absorbed.

**Dedupe runs before filtering.** Otherwise a price filter could drop the copy we
would have kept and leave the copy we would have discarded. The consequence is
that filters apply to the *chosen* copy (the cheapest), which is why merging is
switchable.

**Scoring weights are constants, not configuration.** They are exported and
injectable (`scoreListing(listing, { weights })`), which is enough to tune or A/B
test them, but there is no admin UI. For a real system these belong in config
with per-market overrides.

**The repository is in-memory and the whole corpus is scanned per request.** Fine
for 12 listings, fine for a few thousand. Beyond that, filtering and ranking
belong in the database (or a search index), with the scoring formula pushed down
as a computed column.

**The production bundle is built with esbuild rather than `tsc` emit.** A
monorepo with a source-only shared package makes `tsc` emit awkward — it needs
project references, a dual `exports` map pointing at `src` in development and
`dist` in production, and it leaves the workspace symlink to resolve at runtime.
Bundling sidesteps all of that and yields one self-contained file. The cost is
that stack traces go through a source map, which is why the build emits one.

---

## API

**`GET /api/listings/search`** — all parameters optional.

| Param | Type | Notes |
|---|---|---|
| `minPrice`, `maxPrice` | number ≥ 0 | Inclusive bounds; `minPrice` ≤ `maxPrice` |
| `minBedrooms` | integer ≥ 0 | Inclusive |
| `city` | string | Exact match after normalisation |
| `keyword` | string | OR across terms; description, address, city |
| `status` | `active` \| `pending` \| `sold` | |
| `targetBudget` | number > 0 | Drives relevance; omit to rank on recency alone |
| `dedupe` | boolean | Default `true` |
| `page` | integer ≥ 1 | Default `1` |
| `pageSize` | integer 1–100 | Default `5` |

Returns `{ items, meta, appliedParams }`. Each item carries `relevanceScore`,
`breakdown`, `listingKey`, and any `duplicates` it absorbed. `meta` carries
`totalItems`, `totalPages`, `hasNextPage`, `pageOutOfRange`, `duplicatesCollapsed`.

**`GET /api/listings/facets`** — cities, statuses and ranges present in the data,
used to build the city select and the price hints from real data.

**`GET /api/health`** — listing count and how many malformed records were skipped.

---

## Tests

207 tests. `npm test` runs all three projects.

**Core logic** (`server/tests`, `shared/tests`) — every scoring component at its
boundaries (at budget, at the over-budget cliff, far under, future dates,
unparseable dates); filter inclusivity; the full pipeline.

**Edge cases called out in the brief:**

- *No matches* — city with no listings, impossible price window, empty corpus.
- *Tied scores* — verified stable and independent of input ordering, and verified
  not to repeat or drop a listing across page boundaries.
- *Invalid filter values* — the whole table above, at the parser and over HTTP.
- *Pagination boundaries* — first/middle/last page, exact multiples of `pageSize`,
  partial final page, `pageSize` > total, page past the end, and defensive
  handling of a non-positive `pageSize` or `page` reaching the paginator.

**Production surface** (`server/tests/config.test.ts`) — path auto-detection in
both layouts, the `LISTINGS_DATA_PATH` override, and CORS staying closed unless
`CORS_ORIGIN` is set (including that a non-listed origin is refused).

**Client** (`client/tests`) — loading, results, no-results and error states;
invalid input proven to never reach the network; pagination; the out-of-range
recovery path; and the facet-failure fallback from select to text input.

Scoring takes an injected `now`, so every recency-dependent assertion is
deterministic rather than dependent on the day the suite runs.

---

## Structure

```
shared/src/
  types.ts              Listing, RankedListing, SearchParams, SearchResponse, ApiErrorBody
  search-params.ts      One validator, used by both tiers
server/src/
  paths.ts              Layout-independent path resolution (dev vs bundle)
  domain/score.ts       Scoring — pure functions, injected clock
  domain/filter.ts      Hard filtering gate, separate from ranking
  domain/dedupe.ts      Cross-feed near-duplicate collapsing
  domain/paginate.ts    Pure pagination maths
  domain/search.ts      Pipeline: dedupe → filter → score → sort → paginate
  data/                 Repository + feed validation
  routes/, http/        Express wiring and the single error shape
client/src/
  hooks/                useSearchFilters, useListingSearch, useDebouncedValue, useFacets
  components/ui/        Field, TextField, NumberField, SelectField, Checkbox,
                        Button, Badge, Meter, Spinner, StatusMessage
  components/           SearchFilters, ListingList, ListingCard, PaginationControls,
                        ResultsSummary, ScoreBreakdownPanel
```

`Field` carries the label/hint/error and `id`/`aria-describedby`/`aria-invalid`
plumbing once, so every input gets it for free; `TextField`, `NumberField` and
`SelectField` are thin wrappers over it. `StatusMessage` renders the loading,
empty and error states so they stay visually consistent. `Meter` is reused for
every score component.

Number inputs hold **strings**, not numbers. Coercing on each keystroke would
swallow intermediate states like `""` or `"-"` and make it impossible to submit
the deliberately-invalid input the brief asks us to handle.
