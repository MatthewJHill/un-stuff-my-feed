import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("./data");
const DB_PATH = path.join(DATA_DIR, "feed.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

const db: BetterSqlite3.Database = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

export default db;
