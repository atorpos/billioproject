import express, { type Express } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import type { ListingsRepository } from './data/listings-repository.js';
import { errorHandler, notFoundHandler } from './http/error-handler.js';
import { findUpwards } from './paths.js';
import { createListingsRouter } from './routes/listings.js';

/**
 * The built client, when there is one. In development Vite serves it on its own
 * port and proxies `/api` here, so this is absent and the server is API-only.
 */
function clientDistPath(): string | null {
  const fromEnv = process.env.CLIENT_DIST_PATH;
  if (!fromEnv) return findUpwards('client/dist');

  const resolved = path.resolve(fromEnv);
  if (fs.existsSync(resolved)) return resolved;

  // Serving nothing because of a typo'd path is a miserable thing to debug, so
  // say so rather than quietly starting up as an API-only server.
  console.warn(`[api] CLIENT_DIST_PATH is set to ${resolved}, which does not exist. Serving API only.`);
  return null;
}

/**
 * The client is served from this same origin in production, and the Vite dev
 * server proxies `/api` in development, so neither case needs CORS. It is only
 * enabled when CORS_ORIGIN names the origins a separately hosted client runs on
 * — a wide-open `Access-Control-Allow-Origin: *` is not something to ship by
 * default.
 */
function applyCors(app: Express): void {
  const configured = process.env.CORS_ORIGIN?.trim();
  if (!configured) return;

  app.use(
    cors({
      origin: configured === '*' ? true : configured.split(',').map((origin) => origin.trim()),
    }),
  );
}

export function createApp(repository: ListingsRepository): Express {
  const app = express();

  app.disable('x-powered-by');
  applyCors(app);
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      listings: repository.all().length,
      skippedRecords: repository.skippedRecords,
    });
  });

  app.use('/api/listings', createListingsRouter(repository));

  const clientDist = clientDistPath();
  if (clientDist) {
    // Vite fingerprints everything under /assets, so those files can be cached
    // forever. index.html must not be, or browsers would keep loading the old
    // build's asset URLs after a deploy.
    app.use(
      '/assets',
      express.static(path.join(clientDist, 'assets'), { immutable: true, maxAge: '1y' }),
    );
    app.use(express.static(clientDist, { index: false, maxAge: 0 }));

    // SPA fallback: any non-API route renders the app shell.
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
