import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// Resolve at call-time, not at module-load time. Tests swap DATA_DIR per
// case and re-open the DB; pinning at import time would lock every test to
// whatever directory the first import saw.
function dataDir(): string {
  return process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), 'data');
}

declare global {
  // eslint-disable-next-line no-var
  var __videoDb: Database.Database | undefined;
}

function open(): Database.Database {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'originals'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'hls'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'thumbnails'), { recursive: true });
  const db = new Database(path.join(dir, 'video.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      handle        TEXT NOT NULL UNIQUE,
      display_name  TEXT NOT NULL,
      email         TEXT UNIQUE,
      password_hash TEXT NOT NULL DEFAULT '',
      google_sub    TEXT,
      avatar_url    TEXT,
      bio           TEXT,
      is_admin      INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS videos (
      id            TEXT PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      category      TEXT NOT NULL DEFAULT 'General',
      tags          TEXT NOT NULL DEFAULT '[]',
      status        TEXT NOT NULL DEFAULT 'processing',
      duration      REAL,
      original_path TEXT NOT NULL,
      hls_master    TEXT,
      mp4_path      TEXT,
      thumbnail     TEXT,
      view_count    INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL,
      ready_at      INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_videos_user ON videos(user_id);
    CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
    CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
    CREATE INDEX IF NOT EXISTS idx_videos_status_created ON videos(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_videos_status_category_created
      ON videos(status, category, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_videos_user_status_created
      ON videos(user_id, status, created_at DESC);

    CREATE VIRTUAL TABLE IF NOT EXISTS videos_fts USING fts5(
      title, description, tags,
      content='videos', content_rowid='rowid',
      tokenize='unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS videos_ai AFTER INSERT ON videos BEGIN
      INSERT INTO videos_fts(rowid, title, description, tags)
      VALUES (new.rowid, new.title, new.description, new.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS videos_ad AFTER DELETE ON videos BEGIN
      INSERT INTO videos_fts(videos_fts, rowid, title, description, tags)
      VALUES('delete', old.rowid, old.title, old.description, old.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS videos_au AFTER UPDATE ON videos BEGIN
      INSERT INTO videos_fts(videos_fts, rowid, title, description, tags)
      VALUES('delete', old.rowid, old.title, old.description, old.tags);
      INSERT INTO videos_fts(rowid, title, description, tags)
      VALUES (new.rowid, new.title, new.description, new.tags);
    END;

    CREATE TABLE IF NOT EXISTS comments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id    TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body        TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_video_order
      ON comments(video_id, created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS likes (
      video_id    TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL,
      PRIMARY KEY (video_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id);

    CREATE TABLE IF NOT EXISTS follows (
      follower_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   INTEGER NOT NULL,
      PRIMARY KEY (follower_id, channel_id),
      CHECK (follower_id <> channel_id)
    );
    CREATE INDEX IF NOT EXISTS idx_follows_channel ON follows(channel_id);
    CREATE INDEX IF NOT EXISTS idx_follows_follower_created
      ON follows(follower_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS jobs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id    TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      attempts    INTEGER NOT NULL DEFAULT 0,
      error       TEXT,
      created_at  INTEGER NOT NULL,
      started_at  INTEGER,
      finished_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at);
  `);

  // Migrations for databases created with earlier schemas.
  const userCols = db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[];
  if (!userCols.find(c => c.name === 'google_sub')) {
    db.exec(`ALTER TABLE users ADD COLUMN google_sub TEXT`);
  }
  if (!userCols.find(c => c.name === 'is_admin')) {
    db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`);
  }
  const videoCols = db.prepare(`PRAGMA table_info(videos)`).all() as { name: string }[];
  if (!videoCols.find(c => c.name === 'mp4_path')) {
    db.exec(`ALTER TABLE videos ADD COLUMN mp4_path TEXT`);
  }

  // Indexes that depend on possibly-just-added columns must come last.
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
           ON users(google_sub) WHERE google_sub IS NOT NULL`);

  // The system importer user is always an admin.
  db.exec(`UPDATE users SET is_admin = 1 WHERE handle = 'onemusic' AND is_admin = 0`);
}

export function getDb(): Database.Database {
  if (!global.__videoDb) global.__videoDb = open();
  return global.__videoDb;
}

// Lazy getters so callers see the *current* DATA_DIR (matters in tests, and
// is harmless in production where DATA_DIR doesn't change).
export const paths = {
  get data()       { return dataDir(); },
  get originals()  { return path.join(dataDir(), 'originals'); },
  get hls()        { return path.join(dataDir(), 'hls'); },
  get thumbnails() { return path.join(dataDir(), 'thumbnails'); },
};

export type UserRow = {
  id: number;
  handle: string;
  display_name: string;
  email: string | null;
  password_hash: string;
  google_sub: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_admin: number;
  created_at: number;
};

export type VideoRow = {
  id: string;
  user_id: number;
  title: string;
  description: string;
  category: string;
  tags: string;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  duration: number | null;
  original_path: string;
  hls_master: string | null;
  mp4_path: string | null;
  thumbnail: string | null;
  view_count: number;
  created_at: number;
  ready_at: number | null;
};
