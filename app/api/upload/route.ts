import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { getDb, paths } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { transcodeQueue } from '@/lib/job-queue';
import { runTranscodeWorker } from '@/lib/transcode-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

const ALLOWED_MIME = new Set([
  'video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm', 'video/x-msvideo',
  'application/octet-stream', '',
]);
const ALLOWED_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);

export async function POST(req: NextRequest) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file');
  const title = String(form.get('title') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const category = String(form.get('category') ?? 'General').trim();
  const tagsRaw = String(form.get('tags') ?? '').trim();

  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 });
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
  const mime = file.type ?? '';
  if (!ALLOWED_MIME.has(mime) && !ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: `Unsupported file (mime=${mime}, ext=${ext})` }, { status: 415 });
  }

  const id = crypto.randomBytes(8).toString('hex');
  const destPath = path.join(paths.originals, `${id}${ext}`);

  const ws = fs.createWriteStream(destPath);
  await new Promise<void>((resolve, reject) => {
    Readable.fromWeb(file.stream() as any).pipe(ws);
    ws.on('finish', () => resolve());
    ws.on('error', reject);
  });

  const tags = tagsRaw
    ? JSON.stringify(tagsRaw.split(',').map(s => s.trim()).filter(Boolean))
    : '[]';

  getDb()
    .prepare(
      `INSERT INTO videos (id, user_id, title, description, category, tags, status, original_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'processing', ?, ?)`,
    )
    .run(id, user.id, title, description, category, tags, destPath, Date.now());

  // Hand the transcode off to a queue with a concurrency cap (defaults to 2,
  // override via TRANSCODE_CONCURRENCY). The queue spawns a worker process
  // per slot so ffmpeg runs out-of-band and a burst of uploads can't pin the
  // CPU. The web request returns immediately with `processing`.
  transcodeQueue.enqueue({
    run: () => runTranscodeWorker(id),
    onError: err => console.error('[upload-worker]', id, err),
  });

  return NextResponse.json({ id, status: 'processing' });
}
