import { describe, it, expect } from 'vitest';
import { getDb } from '@/lib/db';

describe('test infra', () => {
  it('uses an isolated DATA_DIR per test', () => {
    expect(process.env.DATA_DIR).toMatch(/alpha-tube-tests/);
  });

  it('initialises the schema on first getDb()', () => {
    const db = getDb();
    const rows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];
    const names = rows.map(r => r.name);
    expect(names).toContain('users');
    expect(names).toContain('videos');
    expect(names).toContain('comments');
    expect(names).toContain('likes');
    expect(names).toContain('jobs');
  });

  it('hands a fresh DB to the next test (no leakage)', () => {
    const db = getDb();
    const count = (db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;
    expect(count).toBe(0);
  });
});
