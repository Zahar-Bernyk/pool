import { NextResponse } from 'next/server';
import { getAdminEmail } from '@/lib/supabase/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyDevices } from '@/lib/apns';

export const dynamic = 'force-dynamic';

// GET /api/push/test — надсилає тестове сповіщення на всі зареєстровані пристрої.
// Лише для адміна. Показує, скільки пристроїв зареєстровано і чи налаштовані ключі.
export async function GET() {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const env = {
    APNS_KEY_ID: Boolean(process.env.APNS_KEY_ID),
    APNS_TEAM_ID: process.env.APNS_TEAM_ID || '(не задано)',
    APNS_BUNDLE_ID: process.env.APNS_BUNDLE_ID || '(не задано)',
    APNS_PRIVATE_KEY: Boolean(process.env.APNS_PRIVATE_KEY),
    APNS_ENV: process.env.APNS_ENV || 'production (за замовчуванням)',
    APP_SHARED_SECRET: Boolean(process.env.APP_SHARED_SECRET),
  };

  const supabase = createAdminClient();
  const { data, error } = await supabase.from('device_tokens').select('token, platform, updated_at');

  if (error) {
    return NextResponse.json({ ok: false, step: 'device_tokens', message: error.message, env }, { status: 500 });
  }

  const devices = data?.length ?? 0;
  if (devices === 0) {
    return NextResponse.json({
      ok: false,
      devices: 0,
      env,
      hint: 'Жодного пристрою не зареєстровано. Відкрийте застосунок на iPhone і дозвольте сповіщення.',
    });
  }

  try {
    await notifyDevices('Тест сповіщень', 'Якщо ви це бачите — пуші працюють ✅');
    return NextResponse.json({ ok: true, devices, env, sent: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, devices, env, message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
