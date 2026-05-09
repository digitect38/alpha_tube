import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { updateProfile } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  invalid_name:  'Display name must be 1–50 characters.',
  invalid_handle: 'Handle must be 3–24 chars: a-z, 0-9, underscore.',
  handle_taken:  'That handle is already taken.',
};

export async function GET() {
  const u = currentUser();
  if (!u) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  return NextResponse.json({
    profile: {
      handle: u.handle,
      displayName: u.display_name,
      bio: u.bio ?? '',
    },
  });
}

export async function PATCH(req: NextRequest) {
  const u = currentUser();
  if (!u) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { displayName, handle, bio } = await req.json();
  const err = updateProfile(u.id, {
    displayName: String(displayName ?? ''),
    handle: String(handle ?? ''),
    bio: String(bio ?? ''),
  });
  if (err) return NextResponse.json({ error: MESSAGES[err] ?? err }, { status: 400 });

  return NextResponse.json({ ok: true });
}
