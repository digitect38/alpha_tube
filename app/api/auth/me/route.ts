import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const u = currentUser();
  if (!u) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      id: u.id,
      handle: u.handle,
      displayName: u.display_name,
      email: u.email,
      avatarUrl: u.avatar_url,
      isAdmin: u.is_admin === 1,
    },
  });
}
