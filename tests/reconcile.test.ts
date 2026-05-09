import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '@/lib/db';
import { findStuckJobs, reconcileStuckJobs, __resetReconcilerGuard } from '@/lib/reconcile';
import { transcodeQueue } from '@/lib/job-queue';

function seedUser(): number {
  const r = getDb()
    .prepare(
      `INSERT INTO users (handle, display_name, password_hash, created_at)
       VALUES ('alice', 'Alice', '', ?)`,
    )
    .run(Date.now());
  return Number(r.lastInsertRowid);
}

function seedVideo(opts: { id: string; user: number; status: string; ts?: number }) {
  getDb()
    .prepare(
      `INSERT INTO videos (id, user_id, title, status, original_path, created_at)
       VALUES (?, ?, ?, ?, '/dev/null', ?)`,
    )
    .run(opts.id, opts.user, 'v', opts.status, opts.ts ?? Date.now());
}

beforeEach(() => {
  __resetReconcilerGuard();
});

describe('findStuckJobs', () => {
  it('returns nothing when no videos are processing', () => {
    seedUser();
    expect(findStuckJobs()).toEqual([]);
  });

  it('returns processing rows oldest-first', () => {
    const u = seedUser();
    seedVideo({ id: 'aaaaaaaaaaaaaaaa', user: u, status: 'processing', ts: 200 });
    seedVideo({ id: 'bbbbbbbbbbbbbbbb', user: u, status: 'processing', ts: 100 });
    seedVideo({ id: 'cccccccccccccccc', user: u, status: 'ready' });
    seedVideo({ id: 'dddddddddddddddd', user: u, status: 'failed' });

    const jobs = findStuckJobs();
    expect(jobs.map(j => j.id)).toEqual(['bbbbbbbbbbbbbbbb', 'aaaaaaaaaaaaaaaa']);
  });
});

describe('reconcileStuckJobs', () => {
  it('returns 0 when nothing is stuck', () => {
    seedUser();
    expect(reconcileStuckJobs()).toBe(0);
  });

  it('enqueues each stuck job onto the transcode queue', () => {
    const u = seedUser();
    seedVideo({ id: 'aaaaaaaaaaaaaaaa', user: u, status: 'processing' });
    seedVideo({ id: 'bbbbbbbbbbbbbbbb', user: u, status: 'processing' });

    const before = transcodeQueue.activeCount + transcodeQueue.pendingCount;
    const n = reconcileStuckJobs();
    const after  = transcodeQueue.activeCount + transcodeQueue.pendingCount;

    expect(n).toBe(2);
    expect(after - before).toBe(2);
  });

  it('only fires once per process — second call is a no-op', () => {
    const u = seedUser();
    seedVideo({ id: 'aaaaaaaaaaaaaaaa', user: u, status: 'processing' });

    expect(reconcileStuckJobs()).toBe(1);
    expect(reconcileStuckJobs()).toBe(0);   // guard tripped
  });
});
