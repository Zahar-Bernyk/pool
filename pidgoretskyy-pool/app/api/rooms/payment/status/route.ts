import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// GET /api/rooms/payment/status?code=HR-#### — статус оплати номера після LiqPay.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code') || '';
  if (!/^HR-\d+$/.test(code)) {
    return NextResponse.json({ error: 'Bad code' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('room_bookings')
    .select('code, paid, status, amount, room, category, check_in, check_out, nights, guests, extra_bed, name')
    .eq('code', code)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ booking: data });
}
