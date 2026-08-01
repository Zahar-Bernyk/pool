import { NextResponse } from 'next/server';
import { getStaff } from '@/lib/events/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Зустрічі (дегустація меню, узгодження оформлення, підписання договору).
// Доступні обом ролям: це робочий графік, а не персональні дані.
export async function GET(req: Request) {
  const staff = await getStaff(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const bookingId = searchParams.get('booking_id');

  const supabase = createAdminClient();
  let q = supabase.from('event_appointments').select('*').order('starts_at', { ascending: true });
  if (bookingId) q = q.eq('booking_id', bookingId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ role: staff.role, appointments: data || [] });
}

export async function POST(req: Request) {
  const staff = await getStaff(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const title = String(body.title || '').trim();
  const startsAt = String(body.starts_at || '').trim();
  if (!title) return NextResponse.json({ error: 'NO_TITLE', message: 'Вкажіть назву зустрічі.' }, { status: 400 });
  if (!startsAt) return NextResponse.json({ error: 'NO_TIME', message: 'Вкажіть час.' }, { status: 400 });

  const str = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s === '' ? null : s;
  };

  const supabase = createAdminClient();
  const { error } = await supabase.from('event_appointments').insert({
    booking_id: str(body.booking_id),
    title,
    starts_at: startsAt,
    duration_min: Number(body.duration_min) > 0 ? Math.round(Number(body.duration_min)) : 60,
    place: str(body.place),
    notes: str(body.notes),
    created_by: staff.email,
    created_by_name: str(body.created_by_name) || staff.fullName,
  });
  if (error) return NextResponse.json({ error: 'DB', message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// PATCH — позначити зустріч виконаною.
export async function PATCH(req: Request) {
  const staff = await getStaff(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const id = String(body.id || '');
  if (!id) return NextResponse.json({ error: 'NO_ID' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('event_appointments')
    .update({ done: body.done === true })
    .eq('id', id);
  if (error) return NextResponse.json({ error: 'DB', message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
