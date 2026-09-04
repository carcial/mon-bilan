import { defineConfig, loadEnv } from "vite";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const FIREBASE_SW_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

function injectFirebaseIntoSw(source, env) {
  let next = source;
  for (const key of FIREBASE_SW_KEYS) {
    next = next.replaceAll(`"__${key}__"`, JSON.stringify(String(env[key] || "")));
  }
  return next;
}

function firebaseSwPlugin(env) {
  return {
    name: "inject-firebase-sw",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ? req.url.split("?")[0] : "";
        if (url !== "/sw.js" && url !== "/sw.js/") return next();
        const swPath = resolve(process.cwd(), "public/sw.js");
        if (!existsSync(swPath)) return next();
        const body = injectFirebaseIntoSw(readFileSync(swPath, "utf8"), env);
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(body);
      });
    },
    closeBundle() {
      const swPath = resolve(process.cwd(), "dist/sw.js");
      if (!existsSync(swPath)) return;
      writeFileSync(swPath, injectFirebaseIntoSw(readFileSync(swPath, "utf8"), env));
    },
  };
}

/**
 * Cloudflare Pages serves the app at https://<project>.pages.dev/ (root `/`).
 * Optional override: set VITE_BASE_PATH for unusual subpath hosting.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = env.VITE_BASE_PATH || "/";

  return {
    base,
    publicDir: "public",
    plugins: [
      firebaseSwPlugin(env),
      {
        name: "phosphor-woff2-only",
        transform(code, id) {
          if (!id.includes("@phosphor-icons") || !id.endsWith(".css")) return null;
          return {
            code: code
              .replace(/\s*url\("[^"]+\.(woff|ttf|svg)[^"]*"\) format\("[^"]+"\),?/g, "")
              .replace(/src:\s*,/g, "src:")
              .replace(/,\s*;/g, ";"),
            map: null,
          };
        },
        generateBundle(_options, bundle) {
          for (const fileName of Object.keys(bundle)) {
            if (/Phosphor.*\.(woff|ttf|svg)$/.test(fileName)) {
              delete bundle[fileName];
            }
          }
        },
      },
    ],
    build: {
      outDir: "dist",
      assetsDir: "assets",
      sourcemap: true,
    },
    test: {
      environment: "node",
      include: ["tests/**/*.test.js"],
    },
  };
});
