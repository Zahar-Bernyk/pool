import { NextResponse } from 'next/server';
import { createRoomBooking } from '@/lib/room-booking-service';
import { liqpayConfigured, buildLiqpayCheckout } from '@/lib/liqpay';

export const dynamic = 'force-dynamic';

// POST /api/rooms/payment/create — публічний. Створює бронювання номера.
//   • ДЕМО (немає ключів LiqPay): одразу оплачено, повертає код.
//   • LiqPay: «придержує» кімнату (paid=false), повертає data+signature.
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const useLiqpay = liqpayConfigured();

  if (!useLiqpay) {
    const result = await createRoomBooking(body, true);
    if (!result.ok) {
      const status = result.error === 'INVALID' ? 400 : 409;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json({ ok: true, mode: 'demo', booking: result.booking });
  }

  const result = await createRoomBooking(body, false);
  if (!result.ok) {
    const status = result.error === 'INVALID' ? 400 : 409;
    return NextResponse.json(result, { status });
  }

  const b = result.booking;
  const site = process.env.NEXT_PUBLIC_SITE_URL || '';
  const checkout = buildLiqpayCheckout({
    amount: b.amount,
    orderId: b.code,
    description: `Підгорецький Маєток · Готель · Номер ${b.room} · ${b.code}`,
    resultUrl: `${site}/hotel?paid=${b.code}`,
    serverUrl: `${site}/api/rooms/payment/callback`,
  });

  return NextResponse.json({
    ok: true,
    mode: 'liqpay',
    booking: b,
    data: checkout.data,
    signature: checkout.signature,
  });
}
