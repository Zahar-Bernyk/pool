import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { allow, clientIp, tooMany } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/rooms/payment/status?code=HR-XXXX[&t=<uuid>]
//
// Доступ навмисно розділено:
//   • лише code            → технічний статус оплати БЕЗ персональних даних
//   • code + t (uuid)      → повні дані для показу квитка власнику бронювання
// Ідентифікатор t невгадуваний, тож перебором кодів імена гостей не дістати.
export async function GET(req: Request) {
  if (!allow(`rstatus:${clientIp(req)}`, 60, 60_000)) return tooMany();

  const { searchParams } = new URL(req.url);
  const code = (searchParams.get('code') || '').toUpperCase();
  const token = searchParams.get('t') || '';

  if (!/^HR-[0-9A-Z]{3,12}$/.test(code)) {
    return NextResponse.json({ error: 'Bad code' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('room_bookings')
    .select('id, code, paid, status, amount, room, category, check_in, check_out, nights, guests, extra_bed, name')
    .eq('code', code)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const owner = UUID_RE.test(token) && token === data.id;
  const { id: _id, name, ...rest } = data;

  return NextResponse.json({ booking: owner ? { ...rest, name } : rest });
}
