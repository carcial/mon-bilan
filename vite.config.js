import { defineConfig, loadEnv } from 'vite';

/**
 * Cloudflare Pages serves the app at https://<project>.pages.dev/ (root `/`).
 * Optional override: set VITE_BASE_PATH for unusual subpath hosting.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH || '/';

  return {
    base,
    publicDir: 'public',
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: true,
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.js'],
    },
  };
});
