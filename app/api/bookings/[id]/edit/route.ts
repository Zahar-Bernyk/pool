import { NextResponse } from 'next/server';
import { getAdminEmail } from '@/lib/supabase/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { TOTAL_SPOTS } from '@/lib/spots';

export const dynamic = 'force-dynamic';

// POST /api/bookings/[id]/edit — редагування бронювання басейну (адмін).
// Дозволяє змінити гостя, дату та місця. Перед збереженням перевіряє,
// чи нові місця вільні на нову дату (щоб не створити подвійне бронювання).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from('bookings')
    .select('id, date, session, spots, status')
    .eq('id', params.id)
    .maybeSingle();

  if (!current) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') patch.name = body.name.trim();
  if (typeof body.phone === 'string') patch.phone = body.phone.trim();
  if (typeof body.amount === 'number' && body.amount >= 0) patch.amount = Math.round(body.amount);
  if (typeof body.paid === 'boolean') patch.paid = body.paid;
  for (const k of ['adults', 'children', 'kids110'] as const) {
    if (typeof body[k] === 'number' && (body[k] as number) >= 0) patch[k] = Math.round(body[k] as number);
  }

  const newDate = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : current.date;
  const newSpots = Array.isArray(body.spots)
    ? (body.spots as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= TOTAL_SPOTS)
    : (current.spots as number[]);

  if (Array.isArray(body.spots) && newSpots.length === 0) {
    return NextResponse.json({ error: 'NO_SPOTS', message: 'Оберіть хоча б одне місце.' }, { status: 400 });
  }

  const dateChanged = newDate !== current.date;
  const spotsChanged = JSON.stringify([...newSpots].sort()) !== JSON.stringify([...(current.spots as number[])].sort());

  // Перевіряємо конфлікти лише якщо змінилися дата або місця
  if (dateChanged || spotsChanged) {
    const { data: others } = await supabase
      .from('bookings')
      .select('id, spots')
      .eq('status', 'active')
      .eq('date', newDate)
      .eq('session', current.session)
      .neq('id', params.id);

    const taken = new Set<number>();
    for (const o of others || []) for (const s of (o.spots as number[]) || []) taken.add(s);
    const clash = newSpots.filter((s) => taken.has(s));
    if (clash.length) {
      return NextResponse.json(
        { error: 'SPOTS_TAKEN', message: `Місця вже зайняті на цю дату: ${clash.join(', ')}` },
        { status: 409 },
      );
    }

    const { data: blocked } = await supabase.from('blocked_spots').select('spot');
    const blockedSet = new Set((blocked || []).map((r: { spot: number }) => r.spot));
    const blockedClash = newSpots.filter((s) => blockedSet.has(s));
    if (blockedClash.length) {
      return NextResponse.json(
        { error: 'SPOTS_BLOCKED', message: `Місця заблоковані: ${blockedClash.join(', ')}` },
        { status: 409 },
      );
    }

    patch.date = newDate;
    patch.spots = newSpots;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true, unchanged: true });

  const { error } = await supabase.from('bookings').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ error: 'DB', message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
