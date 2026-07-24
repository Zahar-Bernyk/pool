import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// GET /api/payment/status?code=PM-#### — перевірка статусу оплати (для LiqPay-режиму
// після повернення з checkout). Повертає мінімум даних.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code') || '';
  if (!/^PM-[0-9A-Z]{3,12}$/.test(code)) {
    return NextResponse.json({ error: 'Bad code' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('bookings')
    .select('code, paid, status, amount, date, session, spots')
    .eq('code', code)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ booking: data });
}
