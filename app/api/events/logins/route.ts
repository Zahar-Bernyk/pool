import { NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/events/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Журнал входів — лише для супер-адміна.
export async function GET(req: Request) {
  const staff = await requireSuperadmin(req);
  if (!staff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('staff_login_log')
    .select('*')
    .order('logged_in_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ log: data || [] });
}
