import { createApp } from './app.js';
import { ListingsRepository } from './data/listings-repository.js';

const PORT = Number(process.env.PORT ?? 4000);

async function main(): Promise<void> {
  const repository = await ListingsRepository.load();

  if (repository.skippedRecords > 0) {
    console.warn(`[api] skipped ${repository.skippedRecords} malformed listing record(s).`);
  }

  createApp(repository).listen(PORT, () => {
    console.log(`[api] listening on http://localhost:${PORT} (${repository.all().length} listings loaded)`);
  });
}

main().catch((error: unknown) => {
  console.error('[api] failed to start', error);
  process.exit(1);
});
