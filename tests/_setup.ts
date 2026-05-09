import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { vi, beforeEach, afterEach } from 'vitest';

// Each test file (and each test, technically) gets a brand-new DATA_DIR so
// no two tests share state. better-sqlite3 caches the connection on
// global.__videoDb — we wipe that and the directory between tests.

const TMP_ROOT = path.join(os.tmpdir(), 'alpha-tube-tests');
fs.mkdirSync(TMP_ROOT, { recursive: true });

let currentDir: string | null = null;

beforeEach(() => {
  currentDir = path.join(TMP_ROOT, crypto.randomBytes(6).toString('hex'));
  fs.mkdirSync(currentDir, { recursive: true });
  process.env.DATA_DIR = currentDir;
  // Force a fresh DB connection for every test
  (globalThis as any).__videoDb = undefined;
  // Reset any header overrides between tests
  __testHeaders = {};
});

afterEach(() => {
  if (currentDir && fs.existsSync(currentDir)) {
    fs.rmSync(currentDir, { recursive: true, force: true });
  }
  currentDir = null;
  (globalThis as any).__videoDb = undefined;
});

// ── Mock next/headers ──────────────────────────────────────────────────────
// auth.ts reads identity from request headers via next/headers `headers()`.
// Tests call setHeaders({...}) to inject what the portal would forward.
let __testHeaders: Record<string, string> = {};

export function setHeaders(h: Record<string, string>) {
  __testHeaders = { ...h };
}

vi.mock('next/headers', () => ({
  headers: () => ({
    get: (name: string) => __testHeaders[name.toLowerCase()] ?? null,
  }),
  cookies: () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

// ── Mock next/cache (unstable_cache) ───────────────────────────────────────
// queries.ts wraps SQL helpers with unstable_cache. In unit tests we want
// every call to hit SQLite directly so we can observe the live state.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: any[]) => any>(fn: T) => fn,
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

// ── Mock next/server ───────────────────────────────────────────────────────
// File route uses NextResponse. Wrap the standard Web Response so tests can
// inspect status/headers/body.
vi.mock('next/server', () => {
  class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      });
    }
  }
  return { NextResponse, NextRequest: Request };
});
