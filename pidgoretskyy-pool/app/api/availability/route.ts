import { NextResponse } from 'next/server';
import { getAvailability } from '@/lib/booking-service';
import type { Session } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET /api/availability?date=YYYY-MM-DD&session=day|evening
// Публічний. Повертає лише номери зайнятих і заблокованих місць.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || '';
  const session = (searchParams.get('session') || '') as Session;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (session !== 'day' && session !== 'evening')) {
    return NextResponse.json({ error: 'Bad params' }, { status: 400 });
  }

  try {
    const { booked, blocked, closed, closedNote } = await getAvailability(date, session);
    return NextResponse.json({ date, session, booked, blocked, closed, closedNote });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
