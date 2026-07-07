import { NextResponse } from 'next/server';
import { liqpaySignature } from '@/lib/liqpay';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// POST /api/rooms/payment/callback — серверний колбек LiqPay для номерів.
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
    await supabase.from('room_bookings').update({ paid: true }).eq('code', orderId);
  } else if (['failure', 'error', 'reversed'].includes(status)) {
    await supabase
      .from('room_bookings')
      .update({ status: 'cancelled' })
      .eq('code', orderId)
      .eq('paid', false);
  }

  return NextResponse.json({ ok: true });
}
