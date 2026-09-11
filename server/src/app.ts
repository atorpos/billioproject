import express, { type Express } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ListingsRepository } from './data/listings-repository.js';
import { errorHandler, notFoundHandler } from './http/error-handler.js';
import { createListingsRouter } from './routes/listings.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(here, '../../client/dist');

export function createApp(repository: ListingsRepository): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      listings: repository.all().length,
      skippedRecords: repository.skippedRecords,
    });
  });

  app.use('/api/listings', createListingsRouter(repository));

  // In production (`npm run build && npm start`) the built client is served from
  // the same origin, so the whole app runs off a single process.
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
