import { NextResponse } from 'next/server';
import { liqpaySignature } from '@/lib/liqpay';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyAdmin, poolBookingMessage } from '@/lib/notify';
import { notifyDevices } from '@/lib/apns';

export const dynamic = 'force-dynamic';

// POST /api/payment/callback — серверний колбек LiqPay (form-urlencoded: data, signature).
// Перевіряє підпис і, якщо оплата успішна, позначає бронювання оплаченим.
export async function POST(req: Request) {
  const form = await req.formData();
  const data = String(form.get('data') || '');
  const signature = String(form.get('signature') || '');

  if (!data || !signature || liqpaySignature(data) !== signature) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Bad data' }, { status: 400 });
  }

  const orderId = payload.order_id as string;
  const status = payload.status as string;
  const paidStatuses = ['success', 'sandbox', 'wait_accept'];

  const supabase = createAdminClient();

  if (paidStatuses.includes(status)) {
    await supabase.from('bookings').update({ paid: true }).eq('code', orderId);
    // Сповіщення адміну (тихо пропускається, якщо Telegram не налаштований).
    const { data: b } = await supabase
      .from('bookings')
      .select('code, name, phone, date, spots, adults, children, amount')
      .eq('code', orderId)
      .maybeSingle();
    if (b) {
      await notifyAdmin(poolBookingMessage(b as any));
      const row = b as any;
      const spots = Array.isArray(row.spots) && row.spots.length ? row.spots.join(', ') : '—';
      await notifyDevices('🏊 Бронювання басейну', `${row.name} · місця ${spots} · ${row.amount} грн`);
    }
  } else if (['failure', 'error', 'reversed'].includes(status)) {
    // Невдала оплата — звільняємо «придержані» місця.
    await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('code', orderId)
      .eq('paid', false);
  }

  return NextResponse.json({ ok: true });
}
