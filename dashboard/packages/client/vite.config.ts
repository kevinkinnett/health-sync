import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Stamp the bundle with the commit it was built from.
 *
 * The service worker precaches this bundle, so a browser can keep running
 * a previous build against a freshly deployed API with nothing on screen
 * saying so. Baking the SHA in at build time is the only way the running
 * client can report its own identity — it cannot ask the server, because
 * the server is deployed separately and may not match.
 *
 * Falls back to "unknown" rather than failing the build: a container that
 * builds from a tarball has no .git, and that must not be fatal.
 */
function buildInfo() {
  const run = (cmd: string): string => {
    try {
      return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return "";
    }
  };
  const commit = process.env.GIT_COMMIT || run("git rev-parse HEAD") || "unknown";
  let version = "0.0.0";
  try {
    version = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
  } catch {
    /* keep the default */
  }
  // The Docker build stage has no .git — the image copies only packages/
  // and the lockfiles — so inside a container these env vars are the ONLY
  // source of truth. Without them a production build reports "unknown"
  // and the whole stamp is inert exactly where it matters.
  const buildNumber = process.env.BUILD_NUMBER?.trim() ?? "";
  return {
    commit,
    shortCommit: commit.slice(0, 7),
    builtAt: process.env.BUILD_TIME || new Date().toISOString(),
    version,
    buildNumber,
    source: buildNumber ? ("ci" as const) : ("local" as const),
  };
}

export default defineConfig(({ mode }) => {
  const viteEnv = loadEnv(mode, import.meta.dirname, "VITE_");

  return {
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo()),
  },
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
        target: viteEnv.VITE_API_PROXY_TARGET ?? "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  };
});
