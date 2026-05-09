import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import {
  follow,
  unfollow,
  isFollowing,
  countFollowers,
  getUserByHandle,
} from '@/lib/queries';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  self_follow:        'You cannot follow yourself.',
  channel_not_found:  'Channel not found.',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { handle: string } },
) {
  const me = currentUser();
  const ch = await getUserByHandle(params.handle);
  if (!ch) return NextResponse.json({ error: 'channel not found' }, { status: 404 });
  return NextResponse.json({
    handle: params.handle,
    followers: countFollowers(ch.id),
    following: me ? isFollowing(me.id, ch.id) : false,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { handle: string } },
) {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const ch = await getUserByHandle(params.handle);
  if (!ch) return NextResponse.json({ error: 'channel not found' }, { status: 404 });

  // Body: { action: 'follow' | 'unfollow' | 'toggle' (default) }
  const body = await req.json().catch(() => ({}));
  const action = (body && body.action) || 'toggle';

  if (action === 'unfollow' || (action === 'toggle' && isFollowing(me.id, ch.id))) {
    unfollow(me.id, ch.id);
  } else {
    const err = follow(me.id, ch.id);
    if (err) return NextResponse.json({ error: ERRORS[err] ?? err }, { status: 400 });
  }

  return NextResponse.json({
    handle: params.handle,
    followers: countFollowers(ch.id),
    following: isFollowing(me.id, ch.id),
  });
}
