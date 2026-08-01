import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdminEmail } from '@/lib/supabase/auth';
import { createBooking } from '@/lib/booking-service';

export const dynamic = 'force-dynamic';

// GET /api/bookings — список усіх бронювань (тільки адмін).
export async function GET() {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient();
  // Показуємо лише підтверджені (оплачені) бронювання — ручні та оплачені через LiqPay.
  // Неоплачені резерви під час оплати сюди не потрапляють.
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', 'active')
    // Оплачені (з сайту й ручні) + ручні неоплачені (гість платить на місці).
    // Покинуті резерви з сайту сюди не потрапляють.
    .or('paid.eq.true,manual.eq.true')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bookings: data });
}

// POST /api/bookings — ручне бронювання персоналом (одразу оплачене й активне).
export async function POST(req: Request) {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  // Персонал сам вирішує, чи бронювання вже оплачене.
  const paid = (body as { paid?: unknown }).paid !== false;
  (body as { manual?: boolean }).manual = true;
  const result = await createBooking(body, paid);

  if (!result.ok) {
    const status = result.error === 'INVALID' ? 400 : 409;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
