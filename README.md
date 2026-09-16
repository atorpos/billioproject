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
