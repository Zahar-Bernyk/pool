import { NextResponse } from 'next/server';
import { createBooking, expireStaleHolds } from '@/lib/booking-service';
import { liqpayConfigured, buildLiqpayCheckout } from '@/lib/liqpay';
import { calcTotal } from '@/lib/pricing';
import { minBookingDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

// POST /api/payment/create — публічний. Створює бронювання.
//   • ДЕМО (немає ключів LiqPay): одразу позначає оплаченим, повертає код.
//   • LiqPay: «придержує» місця (paid=false), повертає data+signature для checkout.
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const useLiqpay = liqpayConfigured();

  // Обмеження часу: після 17:00 за київським часом на сьогодні бронювати вже не можна
  // (лише з наступного дня). Перевіряємо на сервері, щоб не обійшли повз інтерфейс.
  if (typeof body?.date === 'string' && body.date < minBookingDate()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'DATE_CLOSED',
        message: 'Бронювання на обрану дату вже закрите. Будь ласка, оберіть наступний день.',
      },
      { status: 400 },
    );
  }

  // Звільняємо неоплачені резерви, яким вийшов час (щоб місце можна було зайняти).
  await expireStaleHolds();

  // ДЕМО-режим — найпростіший шлях для запуску.
  if (!useLiqpay) {
    const result = await createBooking(body, true);
    if (!result.ok) {
      const status = result.error === 'INVALID' ? 400 : 409;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json({ ok: true, mode: 'demo', booking: result.booking });
  }

  // LiqPay — резервуємо місця неоплаченим активним бронюванням.
  const result = await createBooking(body, false);
  if (!result.ok) {
    const status = result.error === 'INVALID' ? 400 : 409;
    return NextResponse.json(result, { status });
  }

  const amount = calcTotal(body.session, body.date, body.adults, body.children);
  const site = process.env.NEXT_PUBLIC_SITE_URL || '';
  const checkout = buildLiqpayCheckout({
    amount,
    orderId: result.booking.code,
    description: `Підгорецький Маєток · Басейн · ${result.booking.code}`,
    resultUrl: `${site}/booking?paid=${result.booking.code}`,
    serverUrl: `${site}/api/payment/callback`,
  });

  return NextResponse.json({
    ok: true,
    mode: 'liqpay',
    booking: result.booking,
    data: checkout.data,
    signature: checkout.signature,
  });
}
