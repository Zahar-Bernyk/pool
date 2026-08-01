import { NextResponse } from 'next/server';
import { getStaff } from '@/lib/events/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { filterBooking, type EventBookingRow } from '@/lib/events/filter';

export const dynamic = 'force-dynamic';

// GET /api/events/bookings/[id] — одне бронювання (обсяг за роллю).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const staff = await getStaff(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data } = await supabase.from('event_bookings').select('*').eq('id', params.id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  let hasDeposit = false;
  if (staff.role === 'admin') {
    const { data: pay } = await supabase
      .from('event_payments')
      .select('id')
      .eq('booking_id', params.id)
      .limit(1);
    hasDeposit = (pay?.length ?? 0) > 0;
  }

  return NextResponse.json({
    role: staff.role,
    booking: filterBooking(data as EventBookingRow, staff.role, hasDeposit),
  });
}

// PATCH /api/events/bookings/[id] — дозаповнення та зміни.
//  Адміністратор може правити організаційні поля, але НЕ вартість.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const staff = await getStaff(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const str = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s === '' ? null : s;
  };
  const patch: Record<string, unknown> = {};

  // Поля, доступні обом ролям
  if ('event_type' in body) {
    const t = String(body.event_type);
    if (['wedding', 'banquet', 'photo', 'ceremony', 'corporate', 'other'].includes(t)) patch.event_type = t;
  }
  if ('event_date' in body && /^\d{4}-\d{2}-\d{2}$/.test(String(body.event_date))) patch.event_date = body.event_date;
  if ('end_date' in body) patch.end_date = str(body.end_date);
  if ('guests_count' in body) {
    const n = Number(body.guests_count);
    patch.guests_count = Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  if ('venue' in body) patch.venue = str(body.venue);
  if ('notes' in body) patch.notes = str(body.notes);
  if ('status' in body) {
    const s = String(body.status);
    if (['tentative', 'confirmed', 'completed', 'cancelled'].includes(s)) patch.status = s;
  }

  // Персональні дані та гроші — лише супер-адмін.
  // Якщо адміністратор спробує їх надіслати, поля просто ігноруються.
  if (staff.role === 'superadmin') {
    if ('client_name' in body) patch.client_name = str(body.client_name);
    if ('phone' in body) patch.phone = str(body.phone);
    if ('email' in body) patch.email = str(body.email);
    if ('price_total' in body) {
      const n = Number(body.price_total);
      patch.price_total = Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    }
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true, unchanged: true });

  const supabase = createAdminClient();
  const { error } = await supabase.from('event_bookings').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ error: 'DB', message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE — лише супер-адмін.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const staff = await getStaff(req);
  if (staff?.role !== 'superadmin') {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'Видаляти може лише супер-адміністратор.' }, { status: 403 });
  }
  const supabase = createAdminClient();
  const { error } = await supabase.from('event_bookings').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: 'DB', message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
