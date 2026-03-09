import express, { type Request, type Response, type NextFunction } from "express";
import type BetterSqlite3 from "better-sqlite3";
import { makeFeedRouter } from "./routes/feed.js";
import { makeAccountsRouter } from "./routes/accounts.js";
import { makeSyncRouter } from "./routes/sync.js";
import { makePlatformsRouter } from "./routes/platforms.js";

const ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:3001"];

function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  const isChromeExtension = typeof origin === "string" && origin.startsWith("chrome-extension://");

  if (origin && (ALLOWED_ORIGINS.includes(origin) || isChromeExtension)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
}

export function createApp(db: BetterSqlite3.Database): express.Application {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(corsMiddleware);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", makeFeedRouter(db));
  app.use("/api", makeAccountsRouter(db));
  app.use("/api", makeSyncRouter(db));
  app.use("/api", makePlatformsRouter(db));

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // 500 error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
