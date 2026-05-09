import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { toggleLike, userLiked } from '@/lib/queries';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = currentUser();
  if (!user) return NextResponse.json({ authed: false, liked: false });
  return NextResponse.json({
    authed: true,
    liked: userLiked(params.id, user.id),
  });
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(toggleLike(params.id, user.id));
}
