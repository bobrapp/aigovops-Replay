import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    minify: true,
    // Packages listed here are not bundled; they are resolved from node_modules
    // at runtime.  Only packages declared in api-server's own `dependencies` (not
    // devDependencies) are safe to externalize — they are guaranteed present in
    // both dev and production environments.
    //
    // Packages that are ONLY in workspace-sibling deps (e.g. `pg` which is a dep
    // of @workspace/db) must NOT be externalized: Node resolves externals relative
    // to the bundle location, and those packages are not symlinked into
    // artifacts/api-server/node_modules.
    //
    // pino / pino-http / pino-pretty / thread-stream are kept bundled so that
    // esbuild-plugin-pino can generate self-contained worker bundles (pino-pretty
    // is a devDependency absent from production node_modules).
    external: [
      // ── Binary addons ──────────────────────────────────────────────────────
      "*.node",
      // ── Native / platform-specific packages (never bundleable) ─────────────
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      // ── api-server direct runtime dependencies (large, safe to externalize) ─
      // These are in api-server/package.json `dependencies` so they are present
      // in node_modules at runtime in both dev and production.
      "nodemailer",     // explicit in deps
      "zod",            // 266 KB — largest single contributor after @google/genai
      "openid-client",  // 50 KB direct + oauth4webapi/ip-address as its own deps
      "express",        // removes express + mime-db + mime-types from bundle
      "cors",
      "helmet",
      "cookie-parser",
      "express-rate-limit",
      // ── Cloud / infra SDKs (not installed, defensive externals) ────────────
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
