import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { paths } from '@/lib/db';

export const runtime = 'nodejs';

const MIME: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts':   'video/mp2t',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; path: string[] } },
) {
  const id = params.id;
  if (!/^[a-f0-9]{16}$/.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });

  const rel = params.path.join('/');
  const abs = path.normalize(path.join(paths.hls, id, rel));
  const root = path.normalize(path.join(paths.hls, id));
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (!stat.isFile()) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ext = path.extname(abs).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';

  const stream = fs.createReadStream(abs);
  return new NextResponse(stream as any, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'Cache-Control': ext === '.m3u8' ? 'no-cache' : 'public, max-age=86400',
    },
  });
}
