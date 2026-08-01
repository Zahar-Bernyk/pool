import { NextResponse } from 'next/server';
import { getStaff } from '@/lib/events/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// GET /api/events/payments?booking_id=
//  Суми бачить ЛИШЕ супер-адмін. Адміністратору повертаємо тільки
//  ознаку наявності завдатку — щоб він розумів статус, але не бачив грошей.
export async function GET(req: Request) {
  const staff = await getStaff(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const bookingId = searchParams.get('booking_id');

  const supabase = createAdminClient();
  let q = supabase.from('event_payments').select('*').order('paid_at', { ascending: false });
  if (bookingId) q = q.eq('booking_id', bookingId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (staff.role !== 'superadmin') {
    return NextResponse.json({
      role: staff.role,
      restricted: true,
      count: data?.length ?? 0,
      payments: [],
    });
  }

  return NextResponse.json({ role: staff.role, payments: data || [] });
}

// POST — внесення завдатку.
//  Записувати може й адміністратор (він приймає гроші на місці),
//  але переглядати суми потім — лише супер-адмін.
export async function POST(req: Request) {
  const staff = await getStaff(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const bookingId = String(body.booking_id || '');
  const amount = Number(body.amount);
  if (!bookingId) return NextResponse.json({ error: 'NO_BOOKING' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'BAD_AMOUNT', message: 'Вкажіть суму.' }, { status: 400 });
  }

  const str = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s === '' ? null : s;
  };

  const supabase = createAdminClient();
  const { error } = await supabase.from('event_payments').insert({
    booking_id: bookingId,
    amount: Math.round(amount),
    kind: ['deposit', 'partial', 'final', 'refund'].includes(String(body.kind)) ? String(body.kind) : 'deposit',
    method: str(body.method),
    note: str(body.note),
    taken_by: staff.email,
    taken_by_name: str(body.taken_by_name) || staff.fullName,
  });
  if (error) return NextResponse.json({ error: 'DB', message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
