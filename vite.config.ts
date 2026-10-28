import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Serves api/*.ts during `npm run dev` the way Vercel Functions run them in
 * production: each file exports GET/POST handlers taking a Request.
 */
function vercelFunctions(): Plugin {
  const run = async (server: ViteDevServer, req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const name = /^\/api\/([a-z-]+)$/.exec(url.pathname)?.[1];
    const mod = name ? await server.ssrLoadModule(`/api/${name}.ts`) : null;
    const handler = mod?.[req.method ?? 'GET'];
    if (typeof handler !== 'function') {
      res.statusCode = 404;
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const response: Response = await handler(
      new Request(url, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined })
    );
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key !== 'set-cookie') res.setHeader(key, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) res.setHeader('set-cookie', cookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  };

  return {
    name: 'focus-vercel-functions',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        run(server, req, res).catch((error: Error) => {
          server.ssrFixStacktrace(error);
          next(error);
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Functions read DATABASE_URL from .env.local (`vercel env pull`), as on Vercel
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
    process.env[key] ??= value;
  }
  return {
    plugins: [
      react(),
      vercelFunctions(),
      // Installable app: manifest, icons, and a service worker that keeps the
      // app itself available offline. The API is never cached.
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: 'Focus — Distraction-Free Screenwriting',
          short_name: 'Focus',
          description: 'A quiet place to write for the screen. Powered by filmschool.Africa.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#F6F2EA',
          theme_color: '#F6F2EA',
          categories: ['productivity', 'education'],
          icons: [
            { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-stylesheets' },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
  };
});
