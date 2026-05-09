import { NextRequest, NextResponse } from 'next/server';
import { getVideo } from '@/lib/queries';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const v = await getVideo(params.id);
  if (!v) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ video: v });
}
