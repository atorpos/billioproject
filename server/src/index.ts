import { createApp } from './app.js';
import { ListingsRepository } from './data/listings-repository.js';

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? '0.0.0.0';
const SHUTDOWN_GRACE_MS = 10_000;

async function main(): Promise<void> {
  const repository = await ListingsRepository.load();

  if (repository.skippedRecords > 0) {
    console.warn(`[api] skipped ${repository.skippedRecords} malformed listing record(s).`);
  }

  const server = createApp(repository).listen(PORT, HOST, () => {
    console.log(`[api] listening on http://${HOST}:${PORT} (${repository.all().length} listings loaded)`);
  });

  // Orchestrators send SIGTERM and follow up with SIGKILL. Closing the server
  // lets in-flight requests finish instead of being cut off mid-response.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      console.log(`[api] ${signal} received, shutting down`);
      server.close(() => process.exit(0));
      setTimeout(() => {
        console.error('[api] forced exit after shutdown grace period');
        process.exit(1);
      }, SHUTDOWN_GRACE_MS).unref();
    });
  }
}

main().catch((error: unknown) => {
  console.error('[api] failed to start', error);
  process.exit(1);
});
