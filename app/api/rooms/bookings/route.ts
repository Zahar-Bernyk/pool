import { NextResponse } from 'next/server';
import { getAdminEmail } from '@/lib/supabase/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRoomBooking } from '@/lib/room-booking-service';

export const dynamic = 'force-dynamic';

// GET /api/rooms/bookings — усі підтверджені (оплачені) бронювання номерів (адмін).
export async function GET() {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('room_bookings')
    .select('*')
    .eq('status', 'active')
    .eq('paid', true)
    .order('check_in', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bookings: data || [] });
}

// POST /api/rooms/bookings — ручне бронювання номера персоналом (одразу оплачене).
export async function POST(req: Request) {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const result = await createRoomBooking(body as never, true);
  if (!result.ok) {
    const status = result.error === 'INVALID' ? 400 : 409;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
