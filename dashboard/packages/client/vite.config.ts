import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Health Dashboard",
        short_name: "Health",
        description: "Personal health metrics dashboard — activity, sleep, heart rate, HRV, and more.",
        theme_color: "#6366f1",
        background_color: "#030712",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // The SPA navigation fallback (serve index.html for any client-side
        // route) must NOT swallow top-level navigations to the read-only
        // /api/v1 surface — Swagger UI at /api/v1/docs, /api/v1/openapi.json,
        // or any /api link opened directly in the browser. Without this the
        // service worker serves the React shell for those URLs and they
        // appear broken. The app's own data calls are unaffected: they're
        // fetch() (mode "cors"), not navigations, so they keep hitting the
        // NetworkFirst /api cache below — only mode:"navigate" requests use
        // the fallback this denylist guards.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 300,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
