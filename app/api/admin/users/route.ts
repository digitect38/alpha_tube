import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/auth';
import { listAllUsers, setUserAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!currentAdmin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ users: listAllUsers() });
}

export async function PATCH(req: Request) {
  const me = currentAdmin();
  if (!me) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { userId, isAdmin } = await req.json();
  if (typeof userId !== 'number') return NextResponse.json({ error: 'bad userId' }, { status: 400 });
  if (userId === me.id && !isAdmin) {
    return NextResponse.json({ error: 'cannot demote yourself' }, { status: 400 });
  }
  setUserAdmin(userId, !!isAdmin);
  return NextResponse.json({ ok: true });
}
