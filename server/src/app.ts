import express, { type Request, type Response, type NextFunction } from "express";
import type BetterSqlite3 from "better-sqlite3";
import { makeFeedRouter } from "./routes/feed.js";
import { makeAccountsRouter } from "./routes/accounts.js";
import { makeSyncRouter } from "./routes/sync.js";
import { makePlatformsRouter } from "./routes/platforms.js";

const ALLOWED_ORIGINS = ["http://localhost:5173"];

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

  app.use(express.json());
  app.use(corsMiddleware);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", makeFeedRouter(db));
  app.use("/api", makeAccountsRouter(db));
  app.use("/api", makeSyncRouter(db));
  app.use("/api", makePlatformsRouter(db));

  return app;
}
