import { NextResponse } from 'next/server';
import { incrementView } from '@/lib/queries';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!/^[a-f0-9]{16}$/.test(params.id)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 });
  }

  incrementView(params.id);
  return new NextResponse(null, { status: 204 });
}
