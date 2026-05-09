import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb, paths } from '@/lib/db';
import { GET } from '@/app/api/file/[id]/route';

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function makeFile(size: number): string {
  // Touch the DB first so its open() side-effect creates the data dirs.
  getDb();
  const id = crypto.randomBytes(8).toString('hex');
  const filePath = path.join(paths.originals, `${id}.mp4`);
  // Recognisable byte pattern so we can verify slices later.
  const buf = Buffer.alloc(size);
  for (let i = 0; i < size; i++) buf[i] = i & 0xff;
  fs.writeFileSync(filePath, buf);

  // Minimal user + video row so the route handler can find it.
  getDb()
    .prepare(
      `INSERT INTO users (handle, display_name, password_hash, created_at)
       VALUES ('alice', 'Alice', '', ?)`,
    )
    .run(Date.now());
  getDb()
    .prepare(
      `INSERT INTO videos (id, user_id, title, status, original_path, mp4_path, created_at)
       VALUES (?, 1, 'v', 'ready', ?, ?, ?)`,
    )
    .run(id, filePath, filePath, Date.now());
  return id;
}

function callGET(id: string, range?: string) {
  const headers: Record<string, string> = {};
  if (range) headers.Range = range;
  const req = new Request(`http://localhost/apps/video_stream/api/file/${id}`, { headers });
  return GET(req as any, { params: { id } });
}

beforeEach(() => {
  // Each test starts with an empty users table — keep file route happy by
  // always seeding before calling.
});

describe('GET /api/file/[id]', () => {
  it('rejects malformed ids with 400', async () => {
    const r = await callGET('not-a-hex-id');
    expect(r.status).toBe(400);
  });

  it('returns 404 when the row does not exist', async () => {
    const r = await callGET('1234567890abcdef');
    expect(r.status).toBe(404);
  });

  it('returns 404 when the file is missing', async () => {
    const id = crypto.randomBytes(8).toString('hex');
    getDb()
      .prepare(
        `INSERT INTO users (handle, display_name, password_hash, created_at)
         VALUES ('alice', 'A', '', ?)`,
      )
      .run(Date.now());
    getDb()
      .prepare(
        `INSERT INTO videos (id, user_id, title, status, original_path, mp4_path, created_at)
         VALUES (?, 1, 'v', 'ready', '/nope', '/nope', ?)`,
      )
      .run(id, Date.now());
    const r = await callGET(id);
    expect(r.status).toBe(404);
  });

  it('returns 200 with the first slab when no Range header is given', async () => {
    const id = makeFile(64 * 1024);   // 64 KiB — smaller than the 8 MiB cap
    const r = await callGET(id);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Length')).toBe(String(64 * 1024));
    expect(r.headers.get('Accept-Ranges')).toBe('bytes');
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect(bytes.length).toBe(64 * 1024);
    expect(bytes[0]).toBe(0);
    expect(bytes[255]).toBe(255);
    expect(bytes[256]).toBe(0);   // pattern wraps every 256 bytes
  });

  it('returns 206 for a fixed-end Range with exact slice', async () => {
    const id = makeFile(10_000);
    const r = await callGET(id, 'bytes=100-199');
    expect(r.status).toBe(206);
    expect(r.headers.get('Content-Length')).toBe('100');
    expect(r.headers.get('Content-Range')).toBe('bytes 100-199/10000');
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect(bytes[0]).toBe(100);
    expect(bytes[99]).toBe(199);
  });

  it('caps "bytes=0-" to MAX_RESPONSE_BYTES so video tags get a chunk, not the whole file', async () => {
    const id = makeFile(MAX_RESPONSE_BYTES + 4096);   // 8 MiB + a bit
    const r = await callGET(id, 'bytes=0-');
    expect(r.status).toBe(206);
    expect(r.headers.get('Content-Length')).toBe(String(MAX_RESPONSE_BYTES));
    expect(r.headers.get('Content-Range'))
      .toBe(`bytes 0-${MAX_RESPONSE_BYTES - 1}/${MAX_RESPONSE_BYTES + 4096}`);
  });

  it('caps an open-ended range that starts mid-file as well', async () => {
    const total = MAX_RESPONSE_BYTES + 4096;
    const id = makeFile(total);
    const r = await callGET(id, 'bytes=1000-');
    expect(r.status).toBe(206);
    expect(Number(r.headers.get('Content-Length'))).toBe(MAX_RESPONSE_BYTES);
    expect(r.headers.get('Content-Range'))
      .toBe(`bytes 1000-${1000 + MAX_RESPONSE_BYTES - 1}/${total}`);
  });

  it('returns 416 when start ≥ total', async () => {
    const id = makeFile(1000);
    const r = await callGET(id, 'bytes=2000-3000');
    expect(r.status).toBe(416);
    expect(r.headers.get('Content-Range')).toBe('bytes */1000');
  });

  it('emits CDN-safe cache headers', async () => {
    const id = makeFile(100);
    const r = await callGET(id, 'bytes=0-49');
    expect(r.headers.get('Cache-Control')).toBe('private, max-age=3600');
    expect(r.headers.get('Vary')).toBe('Range');
    expect(r.headers.get('Content-Type')).toBe('video/mp4');
  });

  it('handles a suffix range "bytes=-N" (last N bytes)', async () => {
    const id = makeFile(1000);
    const r = await callGET(id, 'bytes=-10');
    expect(r.status).toBe(206);
    expect(r.headers.get('Content-Range')).toBe('bytes 990-999/1000');
    expect(r.headers.get('Content-Length')).toBe('10');
    const bytes = new Uint8Array(await r.arrayBuffer());
    // pattern was i & 0xff, offset 990 → byte value 222, offset 999 → 231
    expect(bytes[0]).toBe(990 & 0xff);
    expect(bytes[9]).toBe(999 & 0xff);
  });

  it('clamps a suffix range larger than the file to the whole file', async () => {
    const id = makeFile(50);
    const r = await callGET(id, 'bytes=-1000');
    expect(r.status).toBe(206);
    expect(r.headers.get('Content-Range')).toBe('bytes 0-49/50');
    expect(r.headers.get('Content-Length')).toBe('50');
  });

  it('returns 416 for "bytes=-0"', async () => {
    const id = makeFile(50);
    const r = await callGET(id, 'bytes=-0');
    expect(r.status).toBe(416);
  });

  it('falls back to a 200 first-slab on malformed Range (multi-range syntax)', async () => {
    const id = makeFile(1000);
    const r = await callGET(id, 'bytes=0-99,200-299');
    expect(r.status).toBe(200);
    expect(Number(r.headers.get('Content-Length'))).toBe(1000);
  });

  it('produces consistent bytes across sequential ranged fetches', async () => {
    const total = MAX_RESPONSE_BYTES * 2 + 17;   // forces three chunks
    const id = makeFile(total);

    const r1 = await callGET(id, 'bytes=0-');
    expect(r1.status).toBe(206);
    const b1 = new Uint8Array(await r1.arrayBuffer());
    expect(b1.length).toBe(MAX_RESPONSE_BYTES);

    const r2 = await callGET(id, `bytes=${MAX_RESPONSE_BYTES}-`);
    expect(r2.status).toBe(206);
    const b2 = new Uint8Array(await r2.arrayBuffer());
    expect(b2.length).toBe(MAX_RESPONSE_BYTES);

    const r3 = await callGET(id, `bytes=${MAX_RESPONSE_BYTES * 2}-`);
    expect(r3.status).toBe(206);
    const b3 = new Uint8Array(await r3.arrayBuffer());
    expect(b3.length).toBe(17);
    // last byte of chunk 1 + first byte of chunk 2 must reconstruct the source
    expect(b1[b1.length - 1]).toBe((MAX_RESPONSE_BYTES - 1) & 0xff);
    expect(b2[0]).toBe(MAX_RESPONSE_BYTES & 0xff);
    expect(b3[16]).toBe((MAX_RESPONSE_BYTES * 2 + 16) & 0xff);
  });
});
