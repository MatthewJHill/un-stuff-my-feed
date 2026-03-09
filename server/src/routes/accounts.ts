import { Router } from "express";
import type BetterSqlite3 from "better-sqlite3";
import type { AccountsResponse, NormalizedUser, Platform } from "@usmf/shared";

interface AccountRow {
  id: string;
  platform_id: string;
  platform_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_active: number;
  imported_at: string;
}

function mapRowToUser(row: AccountRow): NormalizedUser & { isActive: boolean } {
  return {
    id: row.platform_user_id,
    platform: row.platform_id as Platform,
    username: row.username,
    displayName: row.display_name ?? row.username,
    profilePicUrl: row.avatar_url ?? "",
    isActive: row.is_active === 1,
  };
}

export function makeAccountsRouter(db: BetterSqlite3.Database): Router {
  const router = Router();

  router.get("/accounts", (req, res) => {
    const platform = req.query["platform"] as string | undefined;

    try {
      const whereClauses: string[] = [];
      const params: string[] = [];

      if (platform) {
        whereClauses.push("platform_id = ?");
        params.push(platform);
      }

      const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

      const rows = db
        .prepare<string[], AccountRow>(
          `SELECT * FROM accounts ${where} ORDER BY username ASC`
        )
        .all(...params);

      const response: AccountsResponse = {
        accounts: rows.map(mapRowToUser),
      };

      res.json(response);
    } catch {
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  });

  // Bulk toggle must be before :id route to avoid path collision
  router.put("/accounts/bulk-active", (req, res) => {
    const { ids, active } = req.body as { ids?: unknown; active?: unknown };

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids must be a non-empty array" });
      return;
    }

    if (typeof active !== "boolean") {
      res.status(400).json({ error: "active must be a boolean" });
      return;
    }

    const validIds = ids.filter((id): id is string => typeof id === "string");
    if (validIds.length !== ids.length) {
      res.status(400).json({ error: "all ids must be strings" });
      return;
    }

    try {
      const placeholders = validIds.map(() => "?").join(", ");
      const result = db
        .prepare<(number | string)[], BetterSqlite3.RunResult>(
          `UPDATE accounts SET is_active = ? WHERE id IN (${placeholders})`
        )
        .run(active ? 1 : 0, ...validIds);

      res.json({ updated: result.changes });
    } catch {
      res.status(500).json({ error: "Failed to update accounts" });
    }
  });

  router.put("/accounts/:id/active", (req, res) => {
    const { id } = req.params;
    const { active } = req.body as { active?: unknown };

    if (typeof active !== "boolean") {
      res.status(400).json({ error: "active must be a boolean" });
      return;
    }

    try {
      const result = db
        .prepare<[number, string], BetterSqlite3.RunResult>(
          "UPDATE accounts SET is_active = ? WHERE id = ?"
        )
        .run(active ? 1 : 0, id);

      if (result.changes === 0) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      const row = db
        .prepare<[string], AccountRow>("SELECT * FROM accounts WHERE id = ?")
        .get(id);

      res.json(mapRowToUser(row!));
    } catch {
      res.status(500).json({ error: "Failed to update account" });
    }
  });

  return router;
}
