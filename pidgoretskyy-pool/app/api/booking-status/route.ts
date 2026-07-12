import { NextResponse } from 'next/server';
import { getAdminEmail } from '@/lib/supabase/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// GET /api/booking-status — публічний. Чи приймає сайт бронювання.
export async function GET() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('site_settings')
    .select('bookings_open, closed_note')
    .eq('id', 1)
    .maybeSingle();

  return NextResponse.json({
    open: data ? Boolean(data.bookings_open) : true,
    note: data?.closed_note || null,
  });
}

// POST /api/booking-status  { open: boolean, note?: string } — лише адмін.
export async function POST(req: Request) {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const open = Boolean(body?.open);
  const note = body?.note ? String(body.note).slice(0, 200) : null;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('site_settings')
    .update({ bookings_open: open, closed_note: note, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, open });
}
