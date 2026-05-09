import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb, paths } from '@/lib/db';
import { listAllVideos, listAllUsers, deleteVideo, setUserAdmin } from '@/lib/admin';
import { addComment, toggleLike } from '@/lib/queries';

let aliceId: number;
let bobId: number;

function seedUser(handle: string, isAdmin = 0): number {
  const r = getDb()
    .prepare(
      `INSERT INTO users (handle, display_name, password_hash, is_admin, created_at)
       VALUES (?, ?, '', ?, ?)`,
    )
    .run(handle, handle, isAdmin, Date.now());
  return Number(r.lastInsertRowid);
}

function seedVideo(opts: {
  user: number;
  title?: string;
  status?: 'ready' | 'processing' | 'failed';
  originalPath?: string;
  hlsMaster?: string | null;
  thumbnail?: string | null;
}): string {
  const id = crypto.randomBytes(8).toString('hex');
  getDb()
    .prepare(
      `INSERT INTO videos (id, user_id, title, status, original_path, hls_master, thumbnail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      opts.user,
      opts.title ?? 'v',
      opts.status ?? 'ready',
      opts.originalPath ?? path.join(paths.originals, `${id}.mp4`),
      opts.hlsMaster ?? null,
      opts.thumbnail ?? null,
      Date.now(),
    );
  return id;
}

beforeEach(() => {
  // Touch DB so the data dirs exist.
  getDb();
  aliceId = seedUser('alice');
  bobId   = seedUser('bob');
});

describe('listAllVideos', () => {
  it('returns videos in any status, newest-first', () => {
    seedVideo({ user: aliceId, title: 'a', status: 'ready' });
    seedVideo({ user: bobId,   title: 'b', status: 'processing' });
    seedVideo({ user: bobId,   title: 'c', status: 'failed' });

    const all = listAllVideos();
    expect(all).toHaveLength(3);
    expect(all.map(v => v.status).sort()).toEqual(['failed', 'processing', 'ready']);
  });

  it('reports source flags (HLS / MP4) per row', () => {
    seedVideo({ user: aliceId, hlsMaster: 'foo/master.m3u8' });
    seedVideo({ user: aliceId });   // mp4_path implicit via seedVideo? actually no
    // Set mp4_path on the second row directly.
    const r = getDb().prepare(`SELECT id FROM videos WHERE hls_master IS NULL`).get() as { id: string };
    getDb().prepare(`UPDATE videos SET mp4_path = '/x' WHERE id = ?`).run(r.id);

    const all = listAllVideos();
    const hls = all.find(v => v.hasHls)!;
    const mp4 = all.find(v => v.hasMp4 && !v.hasHls)!;
    expect(hls).toBeDefined();
    expect(mp4).toBeDefined();
  });
});

describe('listAllUsers', () => {
  it('returns each user with video count and admin flag', () => {
    seedVideo({ user: aliceId });
    seedVideo({ user: aliceId });
    seedUser('boss', 1);

    const users = listAllUsers();
    const byHandle = Object.fromEntries(users.map(u => [u.handle, u]));
    expect(byHandle.alice.videoCount).toBe(2);
    expect(byHandle.bob.videoCount).toBe(0);
    expect(byHandle.boss.isAdmin).toBe(true);
    expect(byHandle.alice.isAdmin).toBe(false);
  });
});

describe('deleteVideo', () => {
  it('removes the DB row + cascades to comments and likes', () => {
    const id = seedVideo({ user: aliceId });
    addComment(id, aliceId, 'nice');
    toggleLike(id, aliceId);

    const r = deleteVideo(id);
    expect(r.ok).toBe(true);

    const v = getDb().prepare(`SELECT 1 FROM videos WHERE id = ?`).get(id);
    expect(v).toBeUndefined();
    const c = getDb().prepare(`SELECT COUNT(*) AS n FROM comments WHERE video_id = ?`).get(id) as { n: number };
    const l = getDb().prepare(`SELECT COUNT(*) AS n FROM likes WHERE video_id = ?`).get(id) as { n: number };
    expect(c.n).toBe(0);
    expect(l.n).toBe(0);
  });

  it('returns ok:false when the video does not exist', () => {
    const r = deleteVideo('deadbeef00000000');
    expect(r.ok).toBe(false);
  });

  it('removes the HLS dir if present', () => {
    const id = seedVideo({ user: aliceId, hlsMaster: 'master.m3u8' });
    const hlsDir = path.join(paths.hls, id);
    fs.mkdirSync(hlsDir, { recursive: true });
    fs.writeFileSync(path.join(hlsDir, 'master.m3u8'), '#EXTM3U');
    expect(fs.existsSync(hlsDir)).toBe(true);

    deleteVideo(id);
    expect(fs.existsSync(hlsDir)).toBe(false);
  });

  it('removes the thumbnail if recorded', () => {
    const id = seedVideo({ user: aliceId, thumbnail: `${'a'.repeat(16)}.jpg` });
    const thumbPath = path.join(paths.thumbnails, `${'a'.repeat(16)}.jpg`);
    fs.writeFileSync(thumbPath, 'jpg');
    expect(fs.existsSync(thumbPath)).toBe(true);

    deleteVideo(id);
    expect(fs.existsSync(thumbPath)).toBe(false);
  });

  it('deletes the original only when it lives inside our originals dir', () => {
    // Original inside data/originals → should be removed.
    const idA = seedVideo({ user: aliceId });
    const internalPath = path.join(paths.originals, `${idA}.mp4`);
    fs.writeFileSync(internalPath, 'binary');

    // Original outside our data dir (a host-mounted import) → must NOT be deleted.
    const externalPath = path.join('/tmp', `external-${idA}.mp4`);
    fs.writeFileSync(externalPath, 'external');
    const idB = seedVideo({ user: aliceId, originalPath: externalPath });

    deleteVideo(idA);
    expect(fs.existsSync(internalPath)).toBe(false);

    deleteVideo(idB);
    expect(fs.existsSync(externalPath)).toBe(true);
    fs.rmSync(externalPath);
  });
});

describe('setUserAdmin', () => {
  it('promotes and demotes', () => {
    setUserAdmin(aliceId, true);
    let row = getDb().prepare(`SELECT is_admin FROM users WHERE id = ?`).get(aliceId) as { is_admin: number };
    expect(row.is_admin).toBe(1);

    setUserAdmin(aliceId, false);
    row = getDb().prepare(`SELECT is_admin FROM users WHERE id = ?`).get(aliceId) as { is_admin: number };
    expect(row.is_admin).toBe(0);
  });
});
