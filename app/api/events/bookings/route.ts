import { NextResponse } from 'next/server';
import { getStaff } from '@/lib/events/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { filterBookings, type EventBookingRow } from '@/lib/events/filter';
import { generateEventCode } from '@/lib/events/code';

export const dynamic = 'force-dynamic';

// GET /api/events/bookings?from=&to=
//  Повертає бронювання подій. Обсяг даних залежить від ролі:
//  адміністратор отримує зайнятість БЕЗ контактів і сум.
export async function GET(req: Request) {
  const staff = await getStaff(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const supabase = createAdminClient();
  let query = supabase.from('event_bookings').select('*').order('event_date', { ascending: true });
  if (from) query = query.gte('event_date', from);
  if (to) query = query.lte('event_date', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || []) as EventBookingRow[];

  // Для адміністратора позначаємо лише ФАКТ завдатку, без суми
  const depositIds = new Set<string>();
  if (staff.role === 'admin' && rows.length > 0) {
    const { data: pays } = await supabase
      .from('event_payments')
      .select('booking_id')
      .in('booking_id', rows.map((r) => r.id));
    for (const p of pays || []) depositIds.add((p as { booking_id: string }).booking_id);
  }

  return NextResponse.json({
    role: staff.role,
    bookings: filterBookings(rows, staff.role, depositIds),
  });
}

// POST /api/events/bookings — нове бронювання.
//  Обовʼязкові лише тип події та дата — решту дозаповнюють згодом.
export async function POST(req: Request) {
  const staff = await getStaff(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const eventType = String(body.event_type || '').trim();
  const eventDate = String(body.event_date || '').trim();

  const allowedTypes = ['wedding', 'banquet', 'photo', 'ceremony', 'corporate', 'other'];
  if (!allowedTypes.includes(eventType)) {
    return NextResponse.json({ error: 'BAD_TYPE', message: 'Оберіть тип події.' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return NextResponse.json({ error: 'BAD_DATE', message: 'Вкажіть дату події.' }, { status: 400 });
  }

  const str = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s === '' ? null : s;
  };
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };

  const supabase = createAdminClient();

  // Код має бути унікальним; кілька спроб на випадок збігу
  let code = generateEventCode();
  for (let i = 0; i < 5; i++) {
    const { data: exists } = await supabase
      .from('event_bookings')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    if (!exists) break;
    code = generateEventCode();
  }

  const row: Record<string, unknown> = {
    code,
    event_type: eventType,
    event_date: eventDate,
    end_date: str(body.end_date),
    client_name: str(body.client_name),
    phone: str(body.phone),
    email: str(body.email),
    guests_count: num(body.guests_count),
    venue: str(body.venue),
    notes: str(body.notes),
    status: ['tentative', 'confirmed', 'completed', 'cancelled'].includes(String(body.status))
      ? String(body.status)
      : 'tentative',
    // Хто вніс: email береться з сесії (підробити не можна),
    // імʼя співробітник вказує сам — саме воно показується в журналі.
    created_by: staff.email,
    created_by_name: str(body.created_by_name) || staff.fullName,
  };

  // Вартість бачить і задає лише супер-адмін
  if (staff.role === 'superadmin') row.price_total = num(body.price_total);

  const { data, error } = await supabase.from('event_bookings').insert(row).select().single();
  if (error) return NextResponse.json({ error: 'DB', message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, booking: data });
}
