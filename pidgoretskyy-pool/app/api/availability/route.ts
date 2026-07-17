import { NextResponse } from 'next/server';
import { getAvailability } from '@/lib/booking-service';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Session } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET /api/availability?date=YYYY-MM-DD&session=day|evening
// Публічний. Повертає лише номери зайнятих і заблокованих місць.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || '';
  const session = (searchParams.get('session') || '') as Session;

  // ── Тимчасова діагностика: /api/availability?debug=1 ──
  // Показує, що сервер реально читає з blocked_spots і до якого проєкту підключений.
  if (searchParams.get('debug') === '1') {
    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase.from('blocked_spots').select('spot');
      return NextResponse.json({
        projectHost: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace('https://', '').slice(0, 24),
        hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        blockedCount: data ? data.length : null,
        blockedSpots: data ? data.map((r: { spot: number }) => r.spot).sort((a: number, b: number) => a - b) : null,
        readError: error ? error.message : null,
      });
    } catch (e) {
      return NextResponse.json({ debugError: e instanceof Error ? e.message : String(e) });
    }
  }

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
