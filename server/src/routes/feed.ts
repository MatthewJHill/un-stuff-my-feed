import { Router } from "express";
import type BetterSqlite3 from "better-sqlite3";
import type { FeedResponse, NormalizedPost, Platform } from "@usmf/shared";

interface PostRow {
  id: string;
  platform_id: string;
  platform_post_id: string;
  account_id: string;
  platform_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  content_text: string | null;
  post_type: string;
  media_urls: string | null;
  link_url: string | null;
  link_title: string | null;
  original_url: string;
  posted_at: string;
  scraped_at: string;
  engagement_likes: number;
  engagement_comments: number;
  engagement_shares: number | null;
}

function mapRowToPost(row: PostRow): NormalizedPost {
  return {
    id: row.platform_post_id,
    platform: row.platform_id as Platform,
    author: {
      id: row.platform_user_id,
      platform: row.platform_id as Platform,
      username: row.username,
      displayName: row.display_name ?? row.username,
      profilePicUrl: row.avatar_url ?? "",
    },
    content: {
      text: row.content_text ?? "",
      mediaType: row.post_type as NormalizedPost["content"]["mediaType"],
      mediaUrls: row.media_urls ? (JSON.parse(row.media_urls) as string[]) : [],
      articleUrl: row.link_url ?? undefined,
      articleTitle: row.link_title ?? undefined,
    },
    engagement: {
      likes: row.engagement_likes,
      comments: row.engagement_comments,
      shares: row.engagement_shares ?? undefined,
    },
    publishedAt: row.posted_at,
    permalink: row.original_url,
    syncedAt: row.scraped_at,
  };
}

export function makeFeedRouter(db: BetterSqlite3.Database): Router {
  const router = Router();

  router.get("/feed", (req, res) => {
    const page = Math.max(1, parseInt(req.query["page"] as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query["limit"] as string) || 20));
    const platform = req.query["platform"] as string | undefined;
    const offset = (page - 1) * limit;

    try {
      const whereClauses = ["a.is_active = 1"];
      const params: (string | number)[] = [];

      if (platform && platform !== "all") {
        whereClauses.push("p.platform_id = ?");
        params.push(platform);
      }

      const where = whereClauses.join(" AND ");

      const { total } = db
        .prepare<(string | number)[], { total: number }>(
          `SELECT COUNT(*) as total FROM posts p JOIN accounts a ON p.account_id = a.id WHERE ${where}`
        )
        .get(...params)!;

      const rows = db
        .prepare<(string | number)[], PostRow>(
          `SELECT p.*, a.platform_user_id, a.username, a.display_name, a.avatar_url
           FROM posts p
           JOIN accounts a ON p.account_id = a.id
           WHERE ${where}
           ORDER BY p.posted_at DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset);

      const response: FeedResponse = {
        posts: rows.map(mapRowToPost),
        total,
        offset,
        limit,
      };

      res.json(response);
    } catch {
      res.status(500).json({ error: "Failed to fetch feed" });
    }
  });

  return router;
}
