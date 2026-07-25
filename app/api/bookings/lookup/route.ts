import { NextResponse } from 'next/server';
import { getAdminEmail } from '@/lib/supabase/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { CODE_PATTERN } from '@/lib/codes';
import { categoryById } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

// GET /api/bookings/lookup?code=PM-XXXX — перевірка квитка на вході.
// ТІЛЬКИ для адміністратора (містить персональні дані).
export async function GET(req: Request) {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const code = (searchParams.get('code') || '').trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    return NextResponse.json({ found: false, reason: 'BAD_CODE' });
  }

  const supabase = createAdminClient();

  if (code.startsWith('PM-')) {
    const { data } = await supabase
      .from('bookings')
      .select('code, name, phone, date, session, spots, adults, children, kids110, amount, paid, status')
      .eq('code', code)
      .maybeSingle();

    if (!data) return NextResponse.json({ found: false, reason: 'NOT_FOUND', code });

    return NextResponse.json({
      found: true,
      kind: 'pool',
      code: data.code,
      name: data.name,
      phone: data.phone,
      date: data.date,
      session: data.session,
      spots: (data.spots as number[]).slice().sort((a, b) => a - b),
      guests: `${data.adults} дор.${data.children ? ` · ${data.children} діт.` : ''}${
        data.kids110 ? ` · ${data.kids110} до 110 см` : ''
      }`,
      amount: data.amount,
      paid: data.paid,
      cancelled: data.status !== 'active',
    });
  }

  const { data } = await supabase
    .from('room_bookings')
    .select('code, name, phone, room, category, check_in, check_out, nights, guests, extra_bed, amount, paid, status')
    .eq('code', code)
    .maybeSingle();

  if (!data) return NextResponse.json({ found: false, reason: 'NOT_FOUND', code });

  const cat = categoryById(data.category);
  return NextResponse.json({
    found: true,
    kind: 'hotel',
    code: data.code,
    name: data.name,
    phone: data.phone,
    room: data.room,
    category: cat ? cat.title : data.category,
    check_in: data.check_in,
    check_out: data.check_out,
    nights: data.nights,
    guests: `${data.guests} гост.${data.extra_bed ? ' · дод. ліжко' : ''}`,
    amount: data.amount,
    paid: data.paid,
    cancelled: data.status !== 'active',
  });
}
