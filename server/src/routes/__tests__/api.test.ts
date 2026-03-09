import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import Database from "better-sqlite3";
import { createApp } from "../../app.js";
import { initSchema } from "../../db/schema.js";
import type { ExtensionSyncPayload } from "@usmf/shared";

function makeTestApp() {
  const db = new Database(":memory:");
  initSchema(db);
  const app = createApp(db);
  return { db, app };
}

function activateAllAccounts(db: Database.Database) {
  db.prepare("UPDATE accounts SET is_active = 1").run();
}

// ── Health ────────────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────

describe("404 handler", () => {
  it("returns 404 for unknown route", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

// ── Platforms ─────────────────────────────────────────────────────────────────

describe("GET /api/platforms", () => {
  it("returns seeded platforms", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/platforms");
    expect(res.status).toBe(200);
    expect(res.body.platforms).toHaveLength(2);
    expect(res.body.platforms.map((p: { id: string }) => p.id)).toEqual(
      expect.arrayContaining(["instagram", "linkedin"])
    );
  });

  it("platform is not connected before sync", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/platforms");
    expect(res.body.platforms[0].isConnected).toBe(false);
    expect(res.body.platforms[0].lastSyncedAt).toBeNull();
  });
});

// ── Sync ──────────────────────────────────────────────────────────────────────

describe("POST /api/sync", () => {
  it("rejects missing platform", async () => {
    const { app } = makeTestApp();
    const res = await request(app).post("/api/sync").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("rejects invalid platform", async () => {
    const { app } = makeTestApp();
    const res = await request(app).post("/api/sync").send({ platform: "twitter" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("syncs following accounts and returns accountsImported", async () => {
    const { app } = makeTestApp();
    const payload: ExtensionSyncPayload = {
      platform: "instagram",
      following: [
        { id: "u1", platform: "instagram", username: "alice", displayName: "Alice", profilePicUrl: "" },
        { id: "u2", platform: "instagram", username: "bob", displayName: "Bob", profilePicUrl: "" },
      ],
    };
    const res = await request(app).post("/api/sync").send(payload);
    expect(res.status).toBe(200);
    expect(res.body.accountsImported).toBe(2);
  });

  it("new accounts default to inactive (is_active=0)", async () => {
    const { app, db } = makeTestApp();
    await request(app).post("/api/sync").send({
      platform: "instagram",
      following: [
        { id: "u1", platform: "instagram", username: "alice", displayName: "Alice", profilePicUrl: "" },
      ],
    });
    const account = db.prepare("SELECT is_active FROM accounts WHERE platform_user_id = 'u1'").get() as { is_active: number };
    expect(account.is_active).toBe(0);
  });

  it("syncs posts and returns postsImported", async () => {
    const { app } = makeTestApp();
    const payload: ExtensionSyncPayload = {
      platform: "instagram",
      posts: [
        {
          id: "post1",
          platform: "instagram",
          author: { id: "u1", platform: "instagram", username: "alice", displayName: "Alice", profilePicUrl: "" },
          content: { text: "Hello world", mediaType: "text", mediaUrls: [] },
          engagement: { likes: 10, comments: 2 },
          publishedAt: "2024-01-01T00:00:00Z",
          permalink: "https://instagram.com/p/post1",
          syncedAt: "2024-01-01T01:00:00Z",
        },
      ],
    };
    const res = await request(app).post("/api/sync").send(payload);
    expect(res.status).toBe(200);
    expect(res.body.postsImported).toBe(1);
  });

  it("uses deterministic account IDs (ig: prefix for instagram)", async () => {
    const { app, db } = makeTestApp();
    await request(app).post("/api/sync").send({
      platform: "instagram",
      following: [{ id: "u1", platform: "instagram", username: "alice", displayName: "Alice", profilePicUrl: "" }],
    });
    const account = db.prepare("SELECT id FROM accounts WHERE platform_user_id = 'u1'").get() as { id: string };
    expect(account.id).toBe("ig:u1");
  });

  it("uses deterministic account IDs (li: prefix for linkedin)", async () => {
    const { app, db } = makeTestApp();
    await request(app).post("/api/sync").send({
      platform: "linkedin",
      following: [{ id: "u1", platform: "linkedin", username: "alice", displayName: "Alice", profilePicUrl: "" }],
    });
    const account = db.prepare("SELECT id FROM accounts WHERE platform_user_id = 'u1'").get() as { id: string };
    expect(account.id).toBe("li:u1");
  });

  it("uses deterministic post IDs (ig:post_ prefix for instagram)", async () => {
    const { app, db } = makeTestApp();
    await request(app).post("/api/sync").send({
      platform: "instagram",
      posts: [{
        id: "abc123",
        platform: "instagram",
        author: { id: "u1", platform: "instagram", username: "alice", displayName: "Alice", profilePicUrl: "" },
        content: { text: "Hi", mediaType: "text", mediaUrls: [] },
        engagement: { likes: 0, comments: 0 },
        publishedAt: "2024-01-01T00:00:00Z",
        permalink: "https://instagram.com/p/abc123",
        syncedAt: "2024-01-01T01:00:00Z",
      }],
    });
    const post = db.prepare("SELECT id FROM posts WHERE platform_post_id = 'abc123'").get() as { id: string };
    expect(post.id).toBe("ig:post_abc123");
  });

  it("uses deterministic post IDs (li:activity_ prefix for linkedin)", async () => {
    const { app, db } = makeTestApp();
    await request(app).post("/api/sync").send({
      platform: "linkedin",
      posts: [{
        id: "xyz789",
        platform: "linkedin",
        author: { id: "u1", platform: "linkedin", username: "alice", displayName: "Alice", profilePicUrl: "" },
        content: { text: "Hi", mediaType: "text", mediaUrls: [] },
        engagement: { likes: 0, comments: 0 },
        publishedAt: "2024-01-01T00:00:00Z",
        permalink: "https://linkedin.com/feed/update/xyz789",
        syncedAt: "2024-01-01T01:00:00Z",
      }],
    });
    const post = db.prepare("SELECT id FROM posts WHERE platform_post_id = 'xyz789'").get() as { id: string };
    expect(post.id).toBe("li:activity_xyz789");
  });

  it("does not duplicate posts on re-sync", async () => {
    const { app } = makeTestApp();
    const payload: ExtensionSyncPayload = {
      platform: "instagram",
      posts: [{
        id: "post1",
        platform: "instagram",
        author: { id: "u1", platform: "instagram", username: "alice", displayName: "Alice", profilePicUrl: "" },
        content: { text: "Hello world", mediaType: "text", mediaUrls: [] },
        engagement: { likes: 10, comments: 2 },
        publishedAt: "2024-01-01T00:00:00Z",
        permalink: "https://instagram.com/p/post1",
        syncedAt: "2024-01-01T01:00:00Z",
      }],
    };
    await request(app).post("/api/sync").send(payload);
    const res2 = await request(app).post("/api/sync").send(payload);
    expect(res2.status).toBe(200);
    expect(res2.body.postsImported).toBe(0);
  });

  it("marks platform as connected after sync", async () => {
    const { app } = makeTestApp();
    await request(app).post("/api/sync").send({ platform: "instagram", following: [] });
    const res = await request(app).get("/api/platforms");
    const instagram = res.body.platforms.find((p: { id: string }) => p.id === "instagram");
    expect(instagram.isConnected).toBe(true);
    expect(instagram.lastSyncedAt).not.toBeNull();
  });
});

// ── Accounts ──────────────────────────────────────────────────────────────────

describe("GET /api/accounts", () => {
  async function seedAccounts(app: ReturnType<typeof createApp>) {
    await request(app).post("/api/sync").send({
      platform: "instagram",
      following: [
        { id: "u1", platform: "instagram", username: "alice", displayName: "Alice Smith", profilePicUrl: "" },
        { id: "u2", platform: "instagram", username: "bob", displayName: "Bob Jones", profilePicUrl: "" },
      ],
    } satisfies ExtensionSyncPayload);
  }

  it("returns empty array when no accounts", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/accounts");
    expect(res.status).toBe(200);
    expect(res.body.accounts).toEqual([]);
  });

  it("returns synced accounts", async () => {
    const { app } = makeTestApp();
    await seedAccounts(app);
    const res = await request(app).get("/api/accounts");
    expect(res.status).toBe(200);
    expect(res.body.accounts).toHaveLength(2);
  });

  it("filters accounts by platform", async () => {
    const { app } = makeTestApp();
    await seedAccounts(app);
    const res = await request(app).get("/api/accounts?platform=instagram");
    expect(res.status).toBe(200);
    expect(res.body.accounts).toHaveLength(2);

    const res2 = await request(app).get("/api/accounts?platform=linkedin");
    expect(res2.body.accounts).toHaveLength(0);
  });

  it("filters accounts by search term (username match)", async () => {
    const { app } = makeTestApp();
    await seedAccounts(app);
    const res = await request(app).get("/api/accounts?search=alice");
    expect(res.body.accounts).toHaveLength(1);
    expect(res.body.accounts[0].username).toBe("alice");
  });

  it("filters accounts by search term (display_name match)", async () => {
    const { app } = makeTestApp();
    await seedAccounts(app);
    const res = await request(app).get("/api/accounts?search=Jones");
    expect(res.body.accounts).toHaveLength(1);
    expect(res.body.accounts[0].username).toBe("bob");
  });

  it("search is case-insensitive", async () => {
    const { app } = makeTestApp();
    await seedAccounts(app);
    const res = await request(app).get("/api/accounts?search=ALICE");
    expect(res.body.accounts).toHaveLength(1);
  });

  it("orders accounts by display_name", async () => {
    const { app } = makeTestApp();
    await seedAccounts(app);
    const res = await request(app).get("/api/accounts");
    const names = res.body.accounts.map((a: { displayName: string }) => a.displayName);
    expect(names).toEqual([...names].sort());
  });
});

// ── Account toggle ────────────────────────────────────────────────────────────

describe("PUT /api/accounts/:id/active", () => {
  it("toggles account active state using deterministic ID", async () => {
    const { app } = makeTestApp();
    await request(app).post("/api/sync").send({
      platform: "instagram",
      following: [{ id: "u1", platform: "instagram", username: "alice", displayName: "Alice", profilePicUrl: "" }],
    });

    // ID is deterministic: ig:u1
    const res = await request(app).put("/api/accounts/ig:u1/active").send({ active: true });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(true);

    const res2 = await request(app).put("/api/accounts/ig:u1/active").send({ active: false });
    expect(res2.status).toBe(200);
    expect(res2.body.isActive).toBe(false);
  });

  it("returns 404 for unknown account", async () => {
    const { app } = makeTestApp();
    const res = await request(app).put("/api/accounts/nonexistent/active").send({ active: false });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid body", async () => {
    const { app } = makeTestApp();
    const res = await request(app).put("/api/accounts/any/active").send({ active: "yes" });
    expect(res.status).toBe(400);
  });
});

// ── Bulk active ───────────────────────────────────────────────────────────────

describe("PUT /api/accounts/bulk-active", () => {
  it("bulk toggles accounts using deterministic IDs", async () => {
    const { app } = makeTestApp();
    await request(app).post("/api/sync").send({
      platform: "instagram",
      following: [
        { id: "u1", platform: "instagram", username: "alice", displayName: "Alice", profilePicUrl: "" },
        { id: "u2", platform: "instagram", username: "bob", displayName: "Bob", profilePicUrl: "" },
      ],
    });

    const res = await request(app)
      .put("/api/accounts/bulk-active")
      .send({ ids: ["ig:u1", "ig:u2"], active: true });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
  });

  it("returns 400 for empty ids", async () => {
    const { app } = makeTestApp();
    const res = await request(app).put("/api/accounts/bulk-active").send({ ids: [], active: false });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing active", async () => {
    const { app } = makeTestApp();
    const res = await request(app).put("/api/accounts/bulk-active").send({ ids: ["a"] });
    expect(res.status).toBe(400);
  });
});

// ── Feed ──────────────────────────────────────────────────────────────────────

describe("GET /api/feed", () => {
  async function seedFeed(app: ReturnType<typeof createApp>, db: Database.Database) {
    const payload: ExtensionSyncPayload = {
      platform: "instagram",
      posts: [
        {
          id: "post1",
          platform: "instagram",
          author: { id: "u1", platform: "instagram", username: "alice", displayName: "Alice", profilePicUrl: "" },
          content: { text: "Post 1", mediaType: "text", mediaUrls: [] },
          engagement: { likes: 5, comments: 1 },
          publishedAt: "2024-01-02T00:00:00Z",
          permalink: "https://instagram.com/p/post1",
          syncedAt: "2024-01-02T01:00:00Z",
        },
        {
          id: "post2",
          platform: "instagram",
          author: { id: "u2", platform: "instagram", username: "bob", displayName: "Bob", profilePicUrl: "" },
          content: { text: "Post 2", mediaType: "image", mediaUrls: ["https://example.com/img.jpg"] },
          engagement: { likes: 20, comments: 5, shares: 2 },
          publishedAt: "2024-01-01T00:00:00Z",
          permalink: "https://instagram.com/p/post2",
          syncedAt: "2024-01-01T01:00:00Z",
        },
      ],
    };
    await request(app).post("/api/sync").send(payload);
    // Accounts default to inactive — activate them so posts appear in feed
    activateAllAccounts(db);
  }

  it("returns empty feed with no data", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/feed");
    expect(res.status).toBe(200);
    expect(res.body.posts).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("returns posts from active accounts", async () => {
    const { app, db } = makeTestApp();
    await seedFeed(app, db);
    const res = await request(app).get("/api/feed");
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it("does not return posts from inactive accounts", async () => {
    const { app, db } = makeTestApp();
    await seedFeed(app, db);

    // Deactivate alice
    db.prepare("UPDATE accounts SET is_active = 0 WHERE id = 'ig:u1'").run();

    const res = await request(app).get("/api/feed");
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].author.username).toBe("bob");
  });

  it("returns empty feed when all accounts are inactive", async () => {
    const { app } = makeTestApp();
    // Sync without activating
    await request(app).post("/api/sync").send({
      platform: "instagram",
      posts: [{
        id: "p1",
        platform: "instagram",
        author: { id: "u1", platform: "instagram", username: "alice", displayName: "Alice", profilePicUrl: "" },
        content: { text: "Hi", mediaType: "text", mediaUrls: [] },
        engagement: { likes: 0, comments: 0 },
        publishedAt: "2024-01-01T00:00:00Z",
        permalink: "https://instagram.com/p/p1",
        syncedAt: "2024-01-01T01:00:00Z",
      }],
    });
    const res = await request(app).get("/api/feed");
    expect(res.body.posts).toHaveLength(0);
  });

  it("returns posts in reverse chronological order", async () => {
    const { app, db } = makeTestApp();
    await seedFeed(app, db);
    const res = await request(app).get("/api/feed");
    const dates = res.body.posts.map((p: { publishedAt: string }) => p.publishedAt);
    expect(dates[0] > dates[1]).toBe(true);
  });

  it("paginates correctly", async () => {
    const { app, db } = makeTestApp();
    await seedFeed(app, db);

    const page1 = await request(app).get("/api/feed?page=1&limit=1");
    expect(page1.body.posts).toHaveLength(1);
    expect(page1.body.limit).toBe(1);
    expect(page1.body.offset).toBe(0);
    expect(page1.body.total).toBe(2);

    const page2 = await request(app).get("/api/feed?page=2&limit=1");
    expect(page2.body.posts).toHaveLength(1);
    expect(page2.body.offset).toBe(1);
    expect(page2.body.posts[0].id).not.toBe(page1.body.posts[0].id);
  });

  it("filters by platform", async () => {
    const { app, db } = makeTestApp();
    await seedFeed(app, db);

    const res = await request(app).get("/api/feed?platform=instagram");
    expect(res.body.posts).toHaveLength(2);

    const res2 = await request(app).get("/api/feed?platform=linkedin");
    expect(res2.body.posts).toHaveLength(0);
  });

  it("maps engagement correctly", async () => {
    const { app, db } = makeTestApp();
    await seedFeed(app, db);
    const res = await request(app).get("/api/feed");
    const bobPost = res.body.posts.find((p: { author: { username: string } }) => p.author.username === "bob");
    expect(bobPost.engagement).toEqual({ likes: 20, comments: 5, shares: 2 });
  });

  it("maps media urls from image post", async () => {
    const { app, db } = makeTestApp();
    await seedFeed(app, db);
    const res = await request(app).get("/api/feed");
    const bobPost = res.body.posts.find((p: { author: { username: string } }) => p.author.username === "bob");
    expect(bobPost.content.mediaUrls).toEqual(["https://example.com/img.jpg"]);
  });
});
