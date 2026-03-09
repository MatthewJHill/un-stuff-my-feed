import { Router } from "express";
import type BetterSqlite3 from "better-sqlite3";

interface PlatformRow {
  id: string;
  name: string;
  is_connected: number;
  last_synced_at: string | null;
}

export function makePlatformsRouter(db: BetterSqlite3.Database): Router {
  const router = Router();

  router.get("/platforms", (_req, res) => {
    try {
      const rows = db
        .prepare<[], PlatformRow>("SELECT * FROM platforms ORDER BY name ASC")
        .all();

      const platforms = rows.map((row) => ({
        id: row.id,
        name: row.name,
        isConnected: row.is_connected === 1,
        lastSyncedAt: row.last_synced_at,
      }));

      res.json({ platforms });
    } catch {
      res.status(500).json({ error: "Failed to fetch platforms" });
    }
  });

  return router;
}
