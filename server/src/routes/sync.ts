import { Router } from "express";
import type BetterSqlite3 from "better-sqlite3";
import type { ExtensionSyncPayload, NormalizedUser, NormalizedPost, Platform } from "@usmf/shared";

function makeAccountId(platform: Platform, platformUserId: string): string {
  return platform === "instagram" ? `ig:${platformUserId}` : `li:${platformUserId}`;
}

function makePostId(platform: Platform, platformPostId: string): string {
  return platform === "instagram"
    ? `ig:post_${platformPostId}`
    : `li:activity_${platformPostId}`;
}

export function makeSyncRouter(db: BetterSqlite3.Database): Router {
  const router = Router();

  router.post("/sync", (req, res) => {
    const body = req.body as Partial<ExtensionSyncPayload>;
    const { platform, following, posts } = body;

    if (!platform) {
      res.status(400).json({ error: "platform is required" });
      return;
    }

    if (platform !== "instagram" && platform !== "linkedin") {
      res.status(400).json({ error: "platform must be instagram or linkedin" });
      return;
    }

    try {
      const upsertAccount = db.prepare<
        [string, string, string, string, string | null, string | null],
        BetterSqlite3.RunResult
      >(
        `INSERT INTO accounts (id, platform_id, platform_user_id, username, display_name, avatar_url, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(platform_id, platform_user_id) DO UPDATE SET
           username = excluded.username,
           display_name = excluded.display_name,
           avatar_url = excluded.avatar_url`
      );

      const upsertPost = db.prepare<
        [string, string, string, string, string, string | null, string | null, string | null, string | null, string, string, number, number, number | null],
        BetterSqlite3.RunResult
      >(
        `INSERT INTO posts (id, account_id, platform_id, platform_post_id, post_type, content_text, media_urls, link_url, link_title, original_url, posted_at, engagement_likes, engagement_comments, engagement_shares)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(platform_id, platform_post_id) DO NOTHING`
      );

      const syncTx = db.transaction(() => {
        let accountsImported = 0;
        let postsImported = 0;

        if (Array.isArray(following)) {
          for (const user of following as NormalizedUser[]) {
            if (!user.id || !user.username) continue;
            upsertAccount.run(
              makeAccountId(platform, user.id),
              platform,
              user.id,
              user.username,
              user.displayName ?? null,
              user.profilePicUrl ?? null
            );
            accountsImported++;
          }
        }

        if (Array.isArray(posts)) {
          for (const post of posts as NormalizedPost[]) {
            if (!post.id || !post.author?.id) continue;

            const accountId = makeAccountId(platform, post.author.id);

            // Ensure the author account exists before inserting post
            upsertAccount.run(
              accountId,
              platform,
              post.author.id,
              post.author.username,
              post.author.displayName ?? null,
              post.author.profilePicUrl ?? null
            );

            const result = upsertPost.run(
              makePostId(platform, post.id),
              accountId,
              platform,
              post.id,
              post.content.mediaType,
              post.content.text ?? null,
              post.content.mediaUrls?.length ? JSON.stringify(post.content.mediaUrls) : null,
              post.content.articleUrl ?? null,
              post.content.articleTitle ?? null,
              post.permalink,
              post.publishedAt,
              post.engagement?.likes ?? 0,
              post.engagement?.comments ?? 0,
              post.engagement?.shares ?? null
            );

            if (result.changes > 0) postsImported++;
          }
        }

        // Update platform last_synced_at and mark as connected
        db.prepare<[string], BetterSqlite3.RunResult>(
          "UPDATE platforms SET is_connected = 1, last_synced_at = datetime('now') WHERE id = ?"
        ).run(platform);

        return { accountsImported, postsImported };
      });

      const stats = syncTx();
      res.json(stats);
    } catch {
      res.status(500).json({ error: "Sync failed" });
    }
  });

  return router;
}
