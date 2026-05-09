import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/auth';
import { deleteVideo } from '@/lib/admin';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!currentAdmin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const r = deleteVideo(params.id);
  if (!r.ok) return NextResponse.json({ error: r.reason ?? 'failed' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
