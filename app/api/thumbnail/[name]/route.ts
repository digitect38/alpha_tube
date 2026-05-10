import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { paths } from '@/lib/db';
import { isVideoHidden } from '@/lib/visibility';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  if (!/^[a-f0-9]{16}\.jpg$/.test(params.name)) {
    return NextResponse.json({ error: 'bad name' }, { status: 400 });
  }
  const id = params.name.slice(0, 16);
  if (isVideoHidden(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const abs = path.join(paths.thumbnails, params.name);
  if (!fs.existsSync(abs)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const stream = fs.createReadStream(abs);
  return new NextResponse(stream as any, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
  });
}
