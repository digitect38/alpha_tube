import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { listSubscriptionVideos } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  return NextResponse.json({ videos: listSubscriptionVideos(me.id) });
}
