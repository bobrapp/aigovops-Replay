import app from "./app";
import { logger } from "./lib/logger";
import { startWebhookWorker } from "./lib/webhook-worker";
import { listRoutes } from "./lib/list-routes";

// ---------------------------------------------------------------------------
// `--print-routes` — Dev-tooling mode used by scripts/check-spec-drift.ts.
//
// When invoked with this flag the process introspects the live Express app's
// router stack, prints the registered routes as JSON to stdout (delimited by
// `__ROUTES_BEGIN__` / `__ROUTES_END__` markers), and exits without binding
// a port or starting any background workers.  This gives the OpenAPI drift
// checker the *actual* runtime route table instead of having to regex-scrape
// the source files.
// ---------------------------------------------------------------------------
if (process.argv.includes("--print-routes")) {
  // Express 5 exposes the top-level router as a lazy getter at `app.router`;
  // Express 4 stored it eagerly at `app._router`.  Try both so this tooling
  // survives a minor framework upgrade.
  const appUnknown = app as unknown as {
    router?: import("express").IRouter;
    _router?: import("express").IRouter;
  };
  const rootRouter = appUnknown.router ?? appUnknown._router;
  if (!rootRouter) {
    process.stderr.write(
      "[--print-routes] Express app has no router yet (neither .router nor ._router)\n",
    );
    process.exit(2);
  }
  // The combined router is mounted at "/api" in app.ts.  In Express 5 the
  // mount layer's `regexp` is set to `undefined` (path-to-regexp v8 changed
  // the storage location), so a generic walker cannot rediscover the "/api"
  // prefix from the layer alone.  That is fine for our purposes: the OpenAPI
  // spec also uses unprefixed paths (`/healthz`, `/interactions`, …) because
  // its `servers.url` is "/api".  We simply emit paths as registered and
  // strip a leading "/api" if a future mount-path encoding does surface it.
  const routes = listRoutes(rootRouter, "")
    .map((r) => ({
      method: r.method,
      path: r.path.startsWith("/api/")
        ? r.path.slice(4)
        : r.path === "/api"
          ? "/"
          : r.path,
    }))
    .sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
  process.stdout.write(`__ROUTES_BEGIN__\n${JSON.stringify(routes)}\n__ROUTES_END__\n`);
  process.exit(0);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Start in-process webhook delivery worker.
  // Polls webhook_deliveries every WEBHOOK_POLL_INTERVAL_MS (default 5 s).
  startWebhookWorker();
});
