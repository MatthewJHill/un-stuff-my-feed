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

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

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

  it("syncs following accounts", async () => {
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
    expect(res.body.ok).toBe(true);
    expect(res.body.accountsUpserted).toBe(2);
  });

  it("syncs posts and creates accounts for post authors", async () => {
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
    expect(res.body.postsUpserted).toBe(1);
  });

  it("does not duplicate posts on re-sync", async () => {
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
    await request(app).post("/api/sync").send(payload);
    const res2 = await request(app).post("/api/sync").send(payload);
    expect(res2.status).toBe(200);
    expect(res2.body.postsUpserted).toBe(0); // no new posts inserted
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

describe("GET /api/accounts", () => {
  async function seedAccounts(app: ReturnType<typeof createApp>) {
    const payload: ExtensionSyncPayload = {
      platform: "instagram",
      following: [
        { id: "u1", platform: "instagram", username: "alice", displayName: "Alice", profilePicUrl: "" },
        { id: "u2", platform: "instagram", username: "bob", displayName: "Bob", profilePicUrl: "" },
      ],
    };
    await request(app).post("/api/sync").send(payload);
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
});

describe("PUT /api/accounts/:id/active", () => {
  it("toggles account active state", async () => {
    const { app, db } = makeTestApp();
    const payload: ExtensionSyncPayload = {
      platform: "instagram",
      following: [
        { id: "u1", platform: "instagram", username: "alice", displayName: "Alice", profilePicUrl: "" },
      ],
    };
    await request(app).post("/api/sync").send(payload);

    const account = db.prepare("SELECT id FROM accounts WHERE platform_user_id = 'u1'").get() as { id: string };

    const res = await request(app)
      .put(`/api/accounts/${account.id}/active`)
      .send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);

    const res2 = await request(app)
      .put(`/api/accounts/${account.id}/active`)
      .send({ active: true });
    expect(res2.status).toBe(200);
    expect(res2.body.isActive).toBe(true);
  });

  it("returns 404 for unknown account", async () => {
    const { app } = makeTestApp();
    const res = await request(app)
      .put("/api/accounts/nonexistent/active")
      .send({ active: false });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid body", async () => {
    const { app } = makeTestApp();
    const res = await request(app)
      .put("/api/accounts/any/active")
      .send({ active: "yes" });
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/accounts/bulk-active", () => {
  it("bulk toggles accounts", async () => {
    const { app, db } = makeTestApp();
    const payload: ExtensionSyncPayload = {
      platform: "instagram",
      following: [
        { id: "u1", platform: "instagram", username: "alice", displayName: "Alice", profilePicUrl: "" },
        { id: "u2", platform: "instagram", username: "bob", displayName: "Bob", profilePicUrl: "" },
      ],
    };
    await request(app).post("/api/sync").send(payload);

    const accounts = db.prepare("SELECT id FROM accounts").all() as { id: string }[];
    const ids = accounts.map((a) => a.id);

    const res = await request(app)
      .put("/api/accounts/bulk-active")
      .send({ ids, active: false });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
  });

  it("returns 400 for empty ids", async () => {
    const { app } = makeTestApp();
    const res = await request(app)
      .put("/api/accounts/bulk-active")
      .send({ ids: [], active: false });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing active", async () => {
    const { app } = makeTestApp();
    const res = await request(app)
      .put("/api/accounts/bulk-active")
      .send({ ids: ["a"] });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/feed", () => {
  async function seedFeed(app: ReturnType<typeof createApp>) {
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
  }

  it("returns empty feed with no data", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/feed");
    expect(res.status).toBe(200);
    expect(res.body.posts).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("returns posts from active accounts", async () => {
    const { app } = makeTestApp();
    await seedFeed(app);
    const res = await request(app).get("/api/feed");
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it("excludes posts from inactive accounts", async () => {
    const { app, db } = makeTestApp();
    await seedFeed(app);

    // Deactivate alice's account
    db.prepare("UPDATE accounts SET is_active = 0 WHERE platform_user_id = 'u1'").run();

    const res = await request(app).get("/api/feed");
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].author.username).toBe("bob");
  });

  it("returns posts in reverse chronological order", async () => {
    const { app } = makeTestApp();
    await seedFeed(app);
    const res = await request(app).get("/api/feed");
    const dates = res.body.posts.map((p: { publishedAt: string }) => p.publishedAt);
    expect(dates[0] > dates[1]).toBe(true);
  });

  it("paginates correctly", async () => {
    const { app } = makeTestApp();
    await seedFeed(app);

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
    const { app } = makeTestApp();
    await seedFeed(app);

    const res = await request(app).get("/api/feed?platform=instagram");
    expect(res.body.posts).toHaveLength(2);

    const res2 = await request(app).get("/api/feed?platform=linkedin");
    expect(res2.body.posts).toHaveLength(0);
  });

  it("maps engagement correctly", async () => {
    const { app } = makeTestApp();
    await seedFeed(app);
    const res = await request(app).get("/api/feed");
    const bobPost = res.body.posts.find((p: { author: { username: string } }) => p.author.username === "bob");
    expect(bobPost.engagement).toEqual({ likes: 20, comments: 5, shares: 2 });
  });

  it("maps media urls from image post", async () => {
    const { app } = makeTestApp();
    await seedFeed(app);
    const res = await request(app).get("/api/feed");
    const bobPost = res.body.posts.find((p: { author: { username: string } }) => p.author.username === "bob");
    expect(bobPost.content.mediaUrls).toEqual(["https://example.com/img.jpg"]);
  });
});
