import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { getDb } from '@/lib/db';
import {
  listVideos,
  getVideo,
  listChannelVideos,
  searchVideos,
  listComments,
  addComment,
  toggleLike,
  userLiked,
  getUserByHandle,
  updateProfile,
  incrementView,
} from '@/lib/queries';

let userId: number;

function seedUser(handle: string, displayName = handle, isAdmin = 0): number {
  const r = getDb()
    .prepare(
      `INSERT INTO users (handle, display_name, password_hash, is_admin, created_at)
       VALUES (?, ?, '', ?, ?)`,
    )
    .run(handle, displayName, isAdmin, Date.now());
  return Number(r.lastInsertRowid);
}

function seedVideo(opts: {
  user: number;
  title: string;
  category?: string;
  status?: 'ready' | 'processing' | 'failed';
  tags?: string[];
  description?: string;
}): string {
  const id = crypto.randomBytes(8).toString('hex');
  getDb()
    .prepare(
      `INSERT INTO videos (id, user_id, title, description, category, tags, status,
                           original_path, mp4_path, created_at, ready_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '/dev/null', '/dev/null', ?, ?)`,
    )
    .run(
      id,
      opts.user,
      opts.title,
      opts.description ?? '',
      opts.category ?? 'General',
      JSON.stringify(opts.tags ?? []),
      opts.status ?? 'ready',
      Date.now(),
      Date.now(),
    );
  return id;
}

beforeEach(() => {
  userId = seedUser('alice', 'Alice');
});

describe('listVideos', () => {
  it('returns ready videos newest-first', async () => {
    const a = seedVideo({ user: userId, title: 'A' });
    // Tiny gap so created_at differs.
    getDb().prepare(`UPDATE videos SET created_at = created_at - 1000 WHERE id = ?`).run(a);
    const b = seedVideo({ user: userId, title: 'B' });

    const list = await listVideos();
    expect(list.map(v => v.title)).toEqual(['B', 'A']);
  });

  it('omits non-ready videos', async () => {
    seedVideo({ user: userId, title: 'ready-one' });
    seedVideo({ user: userId, title: 'still-cooking', status: 'processing' });
    seedVideo({ user: userId, title: 'broke', status: 'failed' });

    const list = await listVideos();
    expect(list.map(v => v.title).sort()).toEqual(['ready-one']);
  });

  it('filters by category when requested', async () => {
    seedVideo({ user: userId, title: 'jazz1', category: 'Music' });
    seedVideo({ user: userId, title: 'jazz2', category: 'Music' });
    seedVideo({ user: userId, title: 'cat-vid', category: 'General' });

    const music = await listVideos({ category: 'Music' });
    expect(music).toHaveLength(2);
    expect(music.every(v => v.category === 'Music')).toBe(true);
  });

  it('respects limit and offset', async () => {
    for (let i = 0; i < 5; i++) seedVideo({ user: userId, title: 'v' + i });
    const page1 = await listVideos({ limit: 2, offset: 0 });
    const page2 = await listVideos({ limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1[0].id).not.toBe(page2[0].id);
  });
});

describe('getVideo', () => {
  it('returns null for unknown id', async () => {
    expect(await getVideo('deadbeef00000000')).toBeNull();
  });

  it('hydrates author + tags', async () => {
    const id = seedVideo({ user: userId, title: 'Hello', tags: ['a', 'b'] });
    const v = await getVideo(id);
    expect(v?.author.handle).toBe('alice');
    expect(v?.author.displayName).toBe('Alice');
    expect(v?.tags).toEqual(['a', 'b']);
  });
});

describe('listChannelVideos', () => {
  it('returns only the named user\'s ready videos', async () => {
    const bob = seedUser('bob');
    seedVideo({ user: userId, title: 'a-vid' });
    seedVideo({ user: bob, title: 'b-vid' });
    seedVideo({ user: bob, title: 'b-draft', status: 'processing' });

    const aliceVids = await listChannelVideos('alice');
    const bobVids = await listChannelVideos('bob');
    expect(aliceVids.map(v => v.title)).toEqual(['a-vid']);
    expect(bobVids.map(v => v.title)).toEqual(['b-vid']);
  });
});

describe('searchVideos', () => {
  it('returns empty for an empty query', async () => {
    seedVideo({ user: userId, title: 'whatever' });
    expect(await searchVideos('')).toEqual([]);
  });

  it('matches by title token (prefix)', async () => {
    seedVideo({ user: userId, title: 'African Tribal Music' });
    seedVideo({ user: userId, title: 'Eternal Love' });

    const r = await searchVideos('afric');
    expect(r.map(v => v.title)).toContain('African Tribal Music');
    expect(r.map(v => v.title)).not.toContain('Eternal Love');
  });

  it('matches by tag', async () => {
    seedVideo({ user: userId, title: 'one', tags: ['fado'] });
    seedVideo({ user: userId, title: 'two', tags: ['blues'] });
    const r = await searchVideos('fado');
    expect(r.map(v => v.title)).toEqual(['one']);
  });

  it('strips quote characters from the query (defensive)', async () => {
    seedVideo({ user: userId, title: 'okay' });
    expect(await searchVideos('"; DROP --')).toEqual([]);
  });
});

describe('incrementView', () => {
  it('bumps the view counter', async () => {
    const id = seedVideo({ user: userId, title: 'a' });
    expect((await getVideo(id))!.viewCount).toBe(0);
    incrementView(id);
    incrementView(id);
    expect((await getVideo(id))!.viewCount).toBe(2);
  });
});

describe('comments', () => {
  it('inserts and lists newest-first', () => {
    const id = seedVideo({ user: userId, title: 'a' });
    addComment(id, userId, 'first');
    addComment(id, userId, 'second');
    const list = listComments(id);
    expect(list.map(c => c.body)).toEqual(['second', 'first']);
    expect(list[0].author.handle).toBe('alice');
  });
});

describe('toggleLike', () => {
  it('adds a like the first time and removes it the second', () => {
    const id = seedVideo({ user: userId, title: 'a' });
    expect(userLiked(id, userId)).toBe(false);

    const r1 = toggleLike(id, userId);
    expect(r1).toEqual({ liked: true, count: 1 });
    expect(userLiked(id, userId)).toBe(true);

    const r2 = toggleLike(id, userId);
    expect(r2).toEqual({ liked: false, count: 0 });
    expect(userLiked(id, userId)).toBe(false);
  });
});

describe('updateProfile', () => {
  it('rejects an invalid handle', () => {
    expect(updateProfile(userId, { displayName: 'x', handle: 'BAD HANDLE', bio: '' })).toBe(
      'invalid_handle',
    );
  });

  it('rejects a too-short handle', () => {
    expect(updateProfile(userId, { displayName: 'x', handle: 'ab', bio: '' })).toBe(
      'invalid_handle',
    );
  });

  it('rejects an empty display name', () => {
    expect(updateProfile(userId, { displayName: '', handle: 'okay', bio: '' })).toBe(
      'invalid_name',
    );
  });

  it('rejects a handle already taken by someone else', () => {
    seedUser('charlie');
    expect(updateProfile(userId, { displayName: 'Alice', handle: 'charlie', bio: '' })).toBe(
      'handle_taken',
    );
  });

  it('allows keeping the same handle (no self-collision)', async () => {
    expect(updateProfile(userId, { displayName: 'Alice', handle: 'alice', bio: 'hello' })).toBeNull();
    const u = await getUserByHandle('alice');
    expect(u?.bio).toBe('hello');
  });

  it('truncates bio to 500 chars', async () => {
    const long = 'x'.repeat(800);
    updateProfile(userId, { displayName: 'Alice', handle: 'alice', bio: long });
    const u = await getUserByHandle('alice');
    expect(u?.bio?.length).toBe(500);
  });
});
