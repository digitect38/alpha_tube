import type Database from 'better-sqlite3';
import { unstable_cache } from 'next/cache';
import { getDb } from './db';

export type VideoCard = {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  status: string;
  duration: number | null;
  thumbnail: string | null;
  hlsMaster: string | null;
  mp4Path: string | null;
  viewCount: number;
  likeCount: number;
  createdAt: number;
  author: { handle: string; displayName: string };
};

const VIDEO_FIELDS = `
  v.id, v.title, v.description, v.category, v.tags, v.status, v.duration,
  v.thumbnail, v.hls_master, v.mp4_path, v.view_count, v.created_at,
  u.handle AS author_handle, u.display_name AS author_name,
  (SELECT COUNT(*) FROM likes l WHERE l.video_id = v.id) AS like_count
`;

const statementCache = new Map<string, Database.Statement>();
let cachedDb: Database.Database | null = null;
const PUBLIC_REVALIDATE_SECONDS = 15;

function prepared(sql: string): Database.Statement {
  const db = getDb();
  // The DB connection can be swapped underneath us (tests use one DB per
  // case; in production this never trips). Drop stale prepared statements
  // when the underlying connection changes.
  if (db !== cachedDb) {
    statementCache.clear();
    cachedDb = db;
  }
  let stmt = statementCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    statementCache.set(sql, stmt);
  }
  return stmt;
}

const LIST_VIDEOS_SQL = `
  SELECT ${VIDEO_FIELDS}
  FROM videos v JOIN users u ON u.id = v.user_id
  WHERE v.status = 'ready'
  ORDER BY v.created_at DESC
  LIMIT ? OFFSET ?
`;

const LIST_VIDEOS_BY_CATEGORY_SQL = `
  SELECT ${VIDEO_FIELDS}
  FROM videos v JOIN users u ON u.id = v.user_id
  WHERE v.status = 'ready' AND v.category = ?
  ORDER BY v.created_at DESC
  LIMIT ? OFFSET ?
`;

const GET_VIDEO_SQL = `
  SELECT ${VIDEO_FIELDS}
  FROM videos v JOIN users u ON u.id = v.user_id
  WHERE v.id = ?
`;

const LIST_CHANNEL_VIDEOS_SQL = `
  SELECT ${VIDEO_FIELDS}
  FROM videos v JOIN users u ON u.id = v.user_id
  WHERE u.handle = ? AND v.status = 'ready'
  ORDER BY v.created_at DESC
  LIMIT ?
`;

const SEARCH_VIDEOS_SQL = `
  SELECT ${VIDEO_FIELDS}
  FROM videos_fts fts
  JOIN videos v ON v.rowid = fts.rowid
  JOIN users u ON u.id = v.user_id
  WHERE videos_fts MATCH ? AND v.status = 'ready'
  ORDER BY rank
  LIMIT ?
`;

function rowToCard(r: any): VideoCard {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    tags: safeParseTags(r.tags),
    status: r.status,
    duration: r.duration,
    thumbnail: r.thumbnail,
    hlsMaster: r.hls_master,
    mp4Path: r.mp4_path,
    viewCount: r.view_count,
    likeCount: r.like_count,
    createdAt: r.created_at,
    author: { handle: r.author_handle, displayName: r.author_name },
  };
}

function safeParseTags(t: string): string[] {
  try { const v = JSON.parse(t); return Array.isArray(v) ? v : []; } catch { return []; }
}

function listVideosRaw(category: string | undefined, limit: number, offset: number): VideoCard[] {
  const rows = category
    ? prepared(LIST_VIDEOS_BY_CATEGORY_SQL).all(category, limit, offset)
    : prepared(LIST_VIDEOS_SQL).all(limit, offset);
  return (rows as any[]).map(rowToCard);
}

const listVideosCached = unstable_cache(
  async (category: string | null, limit: number, offset: number) =>
    listVideosRaw(category ?? undefined, limit, offset),
  ['public-videos'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export async function listVideos(
  opts: { category?: string; limit?: number; offset?: number } = {},
): Promise<VideoCard[]> {
  const limit = Math.min(opts.limit ?? 24, 100);
  const offset = opts.offset ?? 0;
  return listVideosCached(opts.category ?? null, limit, offset);
}

function getVideoRaw(id: string): VideoCard | null {
  const r = prepared(GET_VIDEO_SQL).get(id) as any;
  return r ? rowToCard(r) : null;
}

const getVideoCached = unstable_cache(
  async (id: string) => getVideoRaw(id),
  ['public-video'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export async function getVideo(id: string): Promise<VideoCard | null> {
  return getVideoCached(id);
}

function listChannelVideosRaw(handle: string, limit: number): VideoCard[] {
  return (prepared(LIST_CHANNEL_VIDEOS_SQL).all(handle, limit) as any[]).map(rowToCard);
}

const listChannelVideosCached = unstable_cache(
  async (handle: string, limit: number) => listChannelVideosRaw(handle, limit),
  ['public-channel-videos'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export async function listChannelVideos(handle: string, limit = 48): Promise<VideoCard[]> {
  return listChannelVideosCached(handle, limit);
}

function searchVideosRaw(fts: string, limit: number): VideoCard[] {
  return (prepared(SEARCH_VIDEOS_SQL).all(fts, limit) as any[]).map(rowToCard);
}

const searchVideosCached = unstable_cache(
  async (fts: string, limit: number) => {
    try {
      return searchVideosRaw(fts, limit);
    } catch {
      return [];
    }
  },
  ['public-search-videos'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export async function searchVideos(q: string, limit = 30): Promise<VideoCard[]> {
  const term = q.replace(/['"]/g, ' ').trim();
  if (!term) return [];
  const fts = term.split(/\s+/).map(t => `${t}*`).join(' ');
  return searchVideosCached(fts, limit);
}

export function incrementView(id: string) {
  prepared(`UPDATE videos SET view_count = view_count + 1 WHERE id = ?`).run(id);
}

export type Comment = {
  id: number;
  body: string;
  createdAt: number;
  author: { handle: string; displayName: string };
};

export function listComments(videoId: string): Comment[] {
  const rows = prepared(
    `SELECT c.id, c.body, c.created_at, u.handle, u.display_name
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.video_id = ?
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT 200`,
  ).all(videoId) as any[];
  return rows.map(r => ({
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    author: { handle: r.handle, displayName: r.display_name },
  }));
}

export function addComment(videoId: string, userId: number, body: string): Comment {
  const now = Date.now();
  const id = prepared(
    `INSERT INTO comments (video_id, user_id, body, created_at) VALUES (?, ?, ?, ?)`,
  ).run(videoId, userId, body, now).lastInsertRowid as number;
  const r = prepared(`SELECT handle, display_name FROM users WHERE id = ?`).get(userId) as {
    handle: string;
    display_name: string;
  };
  return { id, body, createdAt: now, author: { handle: r.handle, displayName: r.display_name } };
}

export function toggleLike(videoId: string, userId: number): { liked: boolean; count: number } {
  const exists = prepared(`SELECT 1 FROM likes WHERE video_id = ? AND user_id = ?`).get(
    videoId,
    userId,
  );
  if (exists) {
    prepared(`DELETE FROM likes WHERE video_id = ? AND user_id = ?`).run(videoId, userId);
  } else {
    prepared(`INSERT INTO likes (video_id, user_id, created_at) VALUES (?, ?, ?)`).run(
      videoId,
      userId,
      Date.now(),
    );
  }
  const count = (prepared(`SELECT COUNT(*) AS n FROM likes WHERE video_id = ?`).get(videoId) as {
    n: number;
  }).n;
  return { liked: !exists, count };
}

export function userLiked(videoId: string, userId: number): boolean {
  return !!prepared(`SELECT 1 FROM likes WHERE video_id = ? AND user_id = ?`).get(videoId, userId);
}

function getUserByHandleRaw(handle: string) {
  return prepared(`SELECT id, handle, display_name, bio, created_at FROM users WHERE handle = ?`)
    .get(handle) as
    | { id: number; handle: string; display_name: string; bio: string | null; created_at: number }
    | undefined;
}

const getUserByHandleCached = unstable_cache(
  async (handle: string) => getUserByHandleRaw(handle),
  ['public-channel-user'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export async function getUserByHandle(handle: string) {
  return getUserByHandleCached(handle);
}

export type UpdateProfileError = 'handle_taken' | 'invalid_handle' | 'invalid_name';

export function updateProfile(
  userId: number,
  fields: { displayName: string; handle: string; bio: string },
): UpdateProfileError | null {
  const displayName = fields.displayName.trim();
  if (displayName.length < 1 || displayName.length > 50) return 'invalid_name';

  const handle = fields.handle.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(handle)) return 'invalid_handle';

  const bio = fields.bio.slice(0, 500);

  const conflict = prepared(`SELECT id FROM users WHERE handle = ? AND id != ?`).get(handle, userId);
  if (conflict) return 'handle_taken';

  prepared(`UPDATE users SET display_name = ?, handle = ?, bio = ? WHERE id = ?`).run(
    displayName,
    handle,
    bio,
    userId,
  );
  return null;
}

// ── Follows / subscriptions ────────────────────────────────────────────────

export type FollowError = 'self_follow' | 'channel_not_found';

export function follow(followerId: number, channelId: number): FollowError | null {
  if (followerId === channelId) return 'self_follow';
  const exists = prepared(`SELECT 1 FROM users WHERE id = ?`).get(channelId);
  if (!exists) return 'channel_not_found';
  prepared(
    `INSERT OR IGNORE INTO follows (follower_id, channel_id, created_at) VALUES (?, ?, ?)`,
  ).run(followerId, channelId, Date.now());
  return null;
}

export function unfollow(followerId: number, channelId: number) {
  prepared(`DELETE FROM follows WHERE follower_id = ? AND channel_id = ?`).run(
    followerId,
    channelId,
  );
}

export function isFollowing(followerId: number, channelId: number): boolean {
  return !!prepared(`SELECT 1 FROM follows WHERE follower_id = ? AND channel_id = ?`).get(
    followerId,
    channelId,
  );
}

export function countFollowers(channelId: number): number {
  return (prepared(`SELECT COUNT(*) AS n FROM follows WHERE channel_id = ?`).get(channelId) as {
    n: number;
  }).n;
}

const SUBS_FEED_SQL = `
  SELECT ${VIDEO_FIELDS}
  FROM follows f
  JOIN videos v ON v.user_id = f.channel_id AND v.status = 'ready'
  JOIN users  u ON u.id      = v.user_id
  WHERE f.follower_id = ?
  ORDER BY v.created_at DESC
  LIMIT ?
`;

// Per-user feed → no shared cache. Each call hits SQLite directly; the
// indexes on follows(follower_id) and videos(user_id, status, created_at DESC)
// keep this fast even with thousands of follows.
export function listSubscriptionVideos(followerId: number, limit = 48): VideoCard[] {
  const rows = prepared(SUBS_FEED_SQL).all(followerId, Math.min(limit, 100)) as any[];
  return rows.map(rowToCard);
}
