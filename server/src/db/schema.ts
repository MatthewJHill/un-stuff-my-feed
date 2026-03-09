import type BetterSqlite3 from "better-sqlite3";

export function initSchema(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS platforms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_connected INTEGER DEFAULT 0,
      last_synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      platform_id TEXT NOT NULL,
      platform_user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      avatar_local_path TEXT,
      is_active INTEGER DEFAULT 0,
      imported_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (platform_id) REFERENCES platforms(id),
      UNIQUE(platform_id, platform_user_id)
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      platform_post_id TEXT NOT NULL,
      content_text TEXT,
      post_type TEXT NOT NULL,
      media_urls TEXT,
      media_local_paths TEXT,
      link_url TEXT,
      link_title TEXT,
      original_url TEXT NOT NULL,
      posted_at TEXT NOT NULL,
      scraped_at TEXT DEFAULT (datetime('now')),
      engagement_likes INTEGER NOT NULL DEFAULT 0,
      engagement_comments INTEGER NOT NULL DEFAULT 0,
      engagement_shares INTEGER,
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (platform_id) REFERENCES platforms(id),
      UNIQUE(platform_id, platform_post_id)
    );

    CREATE INDEX IF NOT EXISTS idx_posts_posted_at ON posts(posted_at);
    CREATE INDEX IF NOT EXISTS idx_posts_account_id ON posts(account_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(is_active);
  `);

  db.exec(`
    INSERT OR IGNORE INTO platforms (id, name) VALUES ('instagram', 'Instagram');
    INSERT OR IGNORE INTO platforms (id, name) VALUES ('linkedin', 'LinkedIn');
  `);
}
