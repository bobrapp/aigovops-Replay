import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { rateLimit } from "express-rate-limit";
import router from "./routes";
import { authMiddleware } from "./middlewares/authMiddleware";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());

/**
 * Limit JSON request bodies to 64 KB to prevent body-based resource exhaustion.
 * prompt + response fields are capped at this size; anything larger is rejected
 * with 413 Payload Too Large before any route handler runs.
 */
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

/**
 * Global rate limiter: 300 requests per minute per IP.
 * Prevents brute-force and bulk enumeration across all endpoints.
 */
const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down." },
});

/**
 * Stricter limiter for expensive read-heavy endpoints.
 * /api/stats runs fullChainIntegrityCheck (3 parallel DB queries).
 * /api/interactions triggers a count(*) plus paginated select.
 * /api/chain runs fullChainIntegrityCheck + a 100-row select.
 */
const heavyReadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests to this endpoint — please slow down." },
});

app.use(globalLimiter);
app.use(["/api/stats", "/api/interactions", "/api/chain"], heavyReadLimiter);

app.use(authMiddleware);

app.use("/api", router);

export default app;
