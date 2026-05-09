import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { getDb } from '@/lib/db';
import {
  follow,
  unfollow,
  isFollowing,
  countFollowers,
  listSubscriptionVideos,
} from '@/lib/queries';

let alice: number;
let bob: number;
let carol: number;

function seedUser(handle: string): number {
  const r = getDb()
    .prepare(
      `INSERT INTO users (handle, display_name, password_hash, created_at)
       VALUES (?, ?, '', ?)`,
    )
    .run(handle, handle, Date.now());
  return Number(r.lastInsertRowid);
}

function seedVideo(opts: { user: number; title: string; status?: string; ts?: number }): string {
  const id = crypto.randomBytes(8).toString('hex');
  const t = opts.ts ?? Date.now();
  getDb()
    .prepare(
      `INSERT INTO videos (id, user_id, title, status, original_path, mp4_path, created_at, ready_at)
       VALUES (?, ?, ?, ?, '/dev/null', '/dev/null', ?, ?)`,
    )
    .run(id, opts.user, opts.title, opts.status ?? 'ready', t, t);
  return id;
}

beforeEach(() => {
  alice = seedUser('alice');
  bob   = seedUser('bob');
  carol = seedUser('carol');
});

describe('follow / unfollow', () => {
  it('returns null on success and isFollowing flips to true', () => {
    expect(follow(alice, bob)).toBeNull();
    expect(isFollowing(alice, bob)).toBe(true);
  });

  it('rejects self-follow', () => {
    expect(follow(alice, alice)).toBe('self_follow');
    expect(isFollowing(alice, alice)).toBe(false);
  });

  it('rejects following a non-existent channel', () => {
    expect(follow(alice, 99999)).toBe('channel_not_found');
  });

  it('is idempotent — calling follow twice is a no-op', () => {
    follow(alice, bob);
    follow(alice, bob);
    expect(countFollowers(bob)).toBe(1);
  });

  it('unfollow removes the row', () => {
    follow(alice, bob);
    unfollow(alice, bob);
    expect(isFollowing(alice, bob)).toBe(false);
    expect(countFollowers(bob)).toBe(0);
  });

  it('unfollow on a non-following pair is a no-op', () => {
    expect(() => unfollow(alice, bob)).not.toThrow();
  });
});

describe('countFollowers', () => {
  it('counts only the channel direction', () => {
    follow(alice, bob);
    follow(carol, bob);
    follow(bob, alice);
    expect(countFollowers(bob)).toBe(2);
    expect(countFollowers(alice)).toBe(1);
    expect(countFollowers(carol)).toBe(0);
  });
});

describe('listSubscriptionVideos', () => {
  it('returns videos only from followed channels, newest first', () => {
    follow(alice, bob);
    // Bob's videos at different times
    seedVideo({ user: bob,   title: 'b-old',   ts: 1000 });
    seedVideo({ user: bob,   title: 'b-new',   ts: 2000 });
    // Carol — alice does NOT follow her
    seedVideo({ user: carol, title: 'c-vid',   ts: 1500 });
    // Alice's own — also not in subs feed
    seedVideo({ user: alice, title: 'a-vid',   ts: 1500 });

    const feed = listSubscriptionVideos(alice);
    expect(feed.map(v => v.title)).toEqual(['b-new', 'b-old']);
  });

  it('omits non-ready videos from followed channels', () => {
    follow(alice, bob);
    seedVideo({ user: bob, title: 'ok',      status: 'ready' });
    seedVideo({ user: bob, title: 'cooking', status: 'processing' });
    seedVideo({ user: bob, title: 'broken',  status: 'failed' });

    const feed = listSubscriptionVideos(alice);
    expect(feed.map(v => v.title)).toEqual(['ok']);
  });

  it('returns an empty list when the user follows nobody', () => {
    seedVideo({ user: bob, title: 'b' });
    expect(listSubscriptionVideos(alice)).toEqual([]);
  });

  it('respects the limit parameter', () => {
    follow(alice, bob);
    for (let i = 0; i < 10; i++) seedVideo({ user: bob, title: 'v' + i, ts: 1000 + i });
    expect(listSubscriptionVideos(alice, 3)).toHaveLength(3);
  });
});

describe('cascade behaviour', () => {
  it('removes follows when the channel user is deleted', () => {
    follow(alice, bob);
    expect(countFollowers(bob)).toBe(1);
    getDb().prepare(`DELETE FROM users WHERE id = ?`).run(bob);
    // Bob is gone — alice's row to him should vanish too
    const row = getDb()
      .prepare(`SELECT 1 FROM follows WHERE follower_id = ?`)
      .get(alice);
    expect(row).toBeUndefined();
  });

  it('removes follows when the follower is deleted', () => {
    follow(alice, bob);
    getDb().prepare(`DELETE FROM users WHERE id = ?`).run(alice);
    expect(countFollowers(bob)).toBe(0);
  });
});
