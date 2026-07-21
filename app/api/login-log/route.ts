import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdminEmail } from '@/lib/supabase/auth';

export const dynamic = 'force-dynamic';

// GET /api/login-log — журнал входів (тільки адмін).
export async function GET() {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from('login_log')
    .select('id, name, logged_in_at')
    .order('logged_in_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ log: data });
}
