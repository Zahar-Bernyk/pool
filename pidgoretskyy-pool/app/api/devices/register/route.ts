import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// POST /api/devices/register  { token: string }
// Заголовок: Authorization: Bearer <APP_SHARED_SECRET>
// Реєструє APNs-токен пристрою адміна для пуш-сповіщень.
export async function POST(req: Request) {
  const secret = process.env.APP_SHARED_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const token = String(body?.token || '').trim();
  if (!/^[0-9a-fA-F]{32,200}$/.test(token)) {
    return NextResponse.json({ error: 'Bad token' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('device_tokens')
    .upsert({ token, platform: 'ios', updated_at: new Date().toISOString() }, { onConflict: 'token' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
