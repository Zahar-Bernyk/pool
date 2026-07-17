import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdminEmail } from '@/lib/supabase/auth';

export const dynamic = 'force-dynamic';

// POST /api/bookings/[id]/cancel — скасувати бронювання (тільки адмін).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient();
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
