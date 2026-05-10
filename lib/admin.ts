import fs from 'node:fs';
import path from 'node:path';
import { getDb, paths } from './db';
import { classifyHidden } from './visibility';

export type AdminVideoRow = {
  id: string;
  title: string;
  category: string;
  status: string;
  duration: number | null;
  viewCount: number;
  createdAt: number;
  authorHandle: string;
  hasMp4: boolean;
  hasHls: boolean;
  originalPath: string;
  sourceDir: string;
  hidden: 'no' | 'by_id' | 'by_pattern';
};

export function listAllVideos(): AdminVideoRow[] {
  return (getDb()
    .prepare(
      `SELECT v.id, v.title, v.category, v.status, v.duration, v.view_count, v.created_at,
              v.mp4_path, v.hls_master, v.original_path, u.handle
       FROM videos v JOIN users u ON u.id = v.user_id
       ORDER BY v.created_at DESC`,
    )
    .all() as any[]).map(r => ({
    id: r.id,
    title: r.title,
    category: r.category,
    status: r.status,
    duration: r.duration,
    viewCount: r.view_count,
    createdAt: r.created_at,
    authorHandle: r.handle,
    hasMp4: !!r.mp4_path,
    hasHls: !!r.hls_master,
    originalPath: r.original_path,
    sourceDir: path.dirname(r.original_path),
    hidden: classifyHidden(r.id, r.original_path),
  }));
}

export type AdminUserRow = {
  id: number;
  handle: string;
  displayName: string;
  email: string | null;
  isAdmin: boolean;
  videoCount: number;
  createdAt: number;
};

export function listAllUsers(): AdminUserRow[] {
  return (getDb()
    .prepare(
      `SELECT u.id, u.handle, u.display_name, u.email, u.is_admin, u.created_at,
              (SELECT COUNT(*) FROM videos v WHERE v.user_id = u.id) AS video_count
       FROM users u
       ORDER BY u.id ASC`,
    )
    .all() as any[]).map(r => ({
    id: r.id,
    handle: r.handle,
    displayName: r.display_name,
    email: r.email,
    isAdmin: r.is_admin === 1,
    videoCount: r.video_count,
    createdAt: r.created_at,
  }));
}

export function deleteVideo(videoId: string): { ok: boolean; reason?: string } {
  const db = getDb();
  const v = db
    .prepare(`SELECT id, original_path, mp4_path, thumbnail FROM videos WHERE id = ?`)
    .get(videoId) as
    | { id: string; original_path: string; mp4_path: string | null; thumbnail: string | null }
    | undefined;
  if (!v) return { ok: false, reason: 'not found' };

  // Delete HLS dir (always inside our data dir).
  const hlsDir = path.join(paths.hls, videoId);
  if (fs.existsSync(hlsDir)) fs.rmSync(hlsDir, { recursive: true, force: true });

  // Delete thumbnail.
  if (v.thumbnail) {
    const thumbPath = path.join(paths.thumbnails, v.thumbnail);
    if (fs.existsSync(thumbPath)) fs.rmSync(thumbPath, { force: true });
  }

  // Only delete the original file if it lives inside our originals dir.
  // Imported videos point at host paths we don't own (read-only mount).
  const origRoot = path.resolve(paths.originals);
  const orig = path.resolve(v.original_path);
  if (orig.startsWith(origRoot + path.sep)) {
    if (fs.existsSync(orig)) fs.rmSync(orig, { force: true });
  }

  // Cascades to comments, likes, jobs via foreign-key ON DELETE CASCADE.
  db.prepare(`DELETE FROM videos WHERE id = ?`).run(videoId);
  return { ok: true };
}

export function setUserAdmin(userId: number, isAdmin: boolean) {
  getDb().prepare(`UPDATE users SET is_admin = ? WHERE id = ?`).run(isAdmin ? 1 : 0, userId);
}
