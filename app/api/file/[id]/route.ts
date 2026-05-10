import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { getDb } from '@/lib/db';
import { isHidden } from '@/lib/visibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 1 MiB read buffer. Default Node stream highWaterMark is 64 KiB which causes
// painful round-trip overhead when piping a multi-GB MP4 back to the browser.
const READ_CHUNK = 1 << 20;

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
};

function nodeToWeb(stream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  // Readable.toWeb is the reliable Web Streams adapter (Node 17+). Casting a
  // raw Node stream to ReadableStream — what we used to do — bypasses the
  // adapter and forces Next.js into a slow per-chunk async path.
  return Readable.toWeb(stream as Readable) as unknown as ReadableStream<Uint8Array>;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[a-f0-9]{16}$/.test(params.id)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 });
  }
  const row = getDb()
    .prepare(`SELECT mp4_path, original_path FROM videos WHERE id = ? AND status = 'ready'`)
    .get(params.id) as { mp4_path: string | null; original_path: string | null } | undefined;
  if (!row?.mp4_path) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (isHidden(params.id, row.original_path)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const abs = row.mp4_path;
  let stat: fs.Stats;
  try { stat = fs.statSync(abs); } catch {
    return NextResponse.json({ error: 'file missing' }, { status: 404 });
  }

  const total = stat.size;
  const ext = path.extname(abs).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';

  const range = req.headers.get('range');
  if (range) {
    // Two RFC 7233 forms:
    //   bytes=A-B   → from offset A through B (B optional → through EOF)
    //   bytes=-N    → suffix: the last N bytes of the file
    const suffix = /^bytes=-(\d+)$/.exec(range);
    const ranged = /^bytes=(\d+)-(\d*)$/.exec(range);
    let start: number;
    let requestedEnd: number;
    if (suffix) {
      const n = Math.min(parseInt(suffix[1], 10), total);
      if (n === 0) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${total}` },
        });
      }
      start = total - n;
      requestedEnd = total - 1;
    } else if (ranged) {
      start = parseInt(ranged[1], 10);
      requestedEnd = ranged[2] ? parseInt(ranged[2], 10) : total - 1;
    } else {
      // Malformed Range header (e.g. multi-range "bytes=0-99,200-299") —
      // fall through to a 200 first-slab response.
      return await sendBytes(abs, 0, Math.min(total, MAX_RESPONSE_BYTES) - 1, total, contentType, false);
    }

    // Cap to MAX_RESPONSE_BYTES so an open-ended "bytes=0-" doesn't trigger
    // a single multi-GB response that times out video playback.
    const end = Math.min(requestedEnd, total - 1, start + MAX_RESPONSE_BYTES - 1);
    if (start < 0 || start >= total || end < start) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}` },
      });
    }
    return await sendBytes(abs, start, end, total, contentType, true);
  }

  // No Range header at all (e.g. a curl without --range). Send the first slab
  // as 200 with Accept-Ranges so the client knows it can range-fetch the rest.
  return await sendBytes(abs, 0, Math.min(total, MAX_RESPONSE_BYTES) - 1, total, contentType, false);
}

// Stream → Web Stream wrapping inside Next route handlers degraded throughput
// massively (multi-second per MiB on a localhost SSD). Reading the slice into
// a single Buffer and returning that lets Next emit the body in one shot,
// which on this stack is roughly 100× faster.
const STREAM_THRESHOLD = 32 * 1024 * 1024;   // ≥ 32 MiB → fall back to streaming

// Cap the body size we ever respond to in a single request, even when the
// client asks for "bytes=0-" (the whole file). Browsers transparently issue
// follow-up range requests for the next slab, so this stays correct while
// turning gigabyte responses into a sequence of fast 8 MiB buffer responses
// — which is what nginx/cloudflare effectively do under the hood.
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

async function sendBytes(
  abs: string,
  start: number,
  end: number,
  total: number,
  contentType: string,
  partial: boolean,
): Promise<NextResponse> {
  const length = end - start + 1;
  const headers: Record<string, string> = {
    'Content-Type':   contentType,
    'Content-Length': String(length),
    'Accept-Ranges':  'bytes',
    // private = browser may cache, but CDNs (Cloudflare etc.) won't. Important
    // for byte-range responses: a CDN that caches one slab can re-serve it
    // for a different Range request and the player ends up stuck on a chunk
    // that doesn't match what it asked for. Vary on Range is also belt-and-
    // suspenders for any well-behaved cache.
    'Cache-Control':  'private, max-age=3600',
    'Vary':           'Range',
  };
  if (partial) headers['Content-Range'] = `bytes ${start}-${end}/${total}`;

  if (length <= STREAM_THRESHOLD) {
    const fh = await fs.promises.open(abs, 'r');
    try {
      const buf = Buffer.allocUnsafe(length);
      let read = 0;
      while (read < length) {
        const r = await fh.read(buf, read, length - read, start + read);
        if (r.bytesRead === 0) break;
        read += r.bytesRead;
      }
      return new NextResponse(buf.subarray(0, read), {
        status: partial ? 206 : 200,
        headers,
      });
    } finally {
      await fh.close();
    }
  }

  const stream = fs.createReadStream(abs, { start, end, highWaterMark: READ_CHUNK });
  return new NextResponse(nodeToWeb(stream), {
    status: partial ? 206 : 200,
    headers,
  });
}
