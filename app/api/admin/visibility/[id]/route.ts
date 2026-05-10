import { NextRequest, NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/auth';
import { setHiddenById } from '@/lib/visibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_RE = /^[a-f0-9]{16}$/;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!currentAdmin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!ID_RE.test(params.id)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 });
  }
  const body = await req.json().catch(() => ({} as any));
  if (typeof body?.hidden !== 'boolean') {
    return NextResponse.json({ error: 'hidden (boolean) required' }, { status: 400 });
  }
  setHiddenById(params.id, body.hidden);
  return NextResponse.json({ id: params.id, hidden: body.hidden });
}
