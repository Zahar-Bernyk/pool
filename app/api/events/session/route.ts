import { NextResponse } from 'next/server';
import { getStaff } from '@/lib/events/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// GET — хто зараз у системі (email, роль, імʼя). Використовує панель при завантаженні.
export async function GET(req: Request) {
  const staff = await getStaff(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ staff });
}

// POST — запис у журнал входів.
// Імʼя та прізвище співробітник вказує сам при вході; email береться з сесії.
export async function POST(req: Request) {
  const staff = await getStaff(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* тіло не обовʼязкове */
  }

  const fullName = String(body.full_name || '').trim();
  if (fullName.length < 3) {
    return NextResponse.json({ error: 'NO_NAME', message: 'Вкажіть імʼя та прізвище.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  await supabase.from('staff_login_log').insert({
    email: staff.email,
    full_name: fullName,
    role: staff.role,
  });

  // Запамʼятовуємо імʼя, щоб підставляти його в нові бронювання
  await supabase.from('staff_roles').update({ full_name: fullName }).eq('email', staff.email);

  return NextResponse.json({ ok: true, staff: { ...staff, fullName } });
}
