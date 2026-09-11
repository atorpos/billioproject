import { defineConfig } from 'vitest/config';

/**
 * Each workspace owns its own Vitest config so the server/shared suites run in
 * a plain Node environment while the client suite runs in jsdom with React.
 */
export default defineConfig({
  test: {
    projects: ['shared', 'server', 'client'],
  },
});
