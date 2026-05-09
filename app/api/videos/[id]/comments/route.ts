import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { addComment, listComments } from '@/lib/queries';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json({ comments: listComments(params.id) });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { body } = await req.json();
  const text = String(body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: 'too long' }, { status: 400 });
  const c = addComment(params.id, user.id, text);
  return NextResponse.json({ comment: c });
}
