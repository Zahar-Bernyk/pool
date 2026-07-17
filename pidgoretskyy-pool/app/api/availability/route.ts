import { NextResponse } from 'next/server';
import { getAvailability } from '@/lib/booking-service';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Session } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET /api/availability?date=YYYY-MM-DD&session=day|evening
// Публічний. Повертає лише номери зайнятих і заблокованих місць.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || '';
  const session = (searchParams.get('session') || '') as Session;

  // ── Тимчасова діагностика: /api/availability?debug=1 ──
  // Показує РОЛЬ ключа (не розкриваючи сам ключ), до якого проєкту підключено сервер,
  // і чи бачить «адмін»-клієнт рядки в bookings та blocked_spots.
  // ⚠️ ПРИБРАТИ разом із цим блоком та import createAdminClient після розв'язання (розділ 12 звіту).
  if (searchParams.get('debug') === '1') {
    // Безпечно визначаємо ТИП/РОЛЬ ключа, не повертаючи його вміст.
    // - Новий формат: sb_secret_... (=service_role) або sb_publishable_... (=anon).
    // - Старий формат: JWT (eyJ...), у payload є claim "role" (anon | service_role) — не секрет.
    function keyInfo(raw: string | undefined) {
      if (!raw) return { present: false as const };
      if (raw.startsWith('sb_secret_')) return { present: true, kind: 'new_secret', role: 'service_role' };
      if (raw.startsWith('sb_publishable_')) return { present: true, kind: 'new_publishable', role: 'anon' };
      if (raw.startsWith('eyJ')) {
        try {
          const payload = raw.split('.')[1] || '';
          const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
            role?: string;
            ref?: string;
          };
          return { present: true, kind: 'jwt', role: json.role ?? null, ref: json.ref ?? null };
        } catch {
          return { present: true, kind: 'jwt_unparsable' };
        }
      }
      return { present: true, kind: 'unknown' };
    }

    try {
      const supabase = createAdminClient();
      // Читаємо обидві критичні таблиці ТИМ САМИМ клієнтом, що й реальна доступність.
      const [{ data: blk, error: blkErr }, { data: bk, error: bkErr }] = await Promise.all([
        supabase.from('blocked_spots').select('spot'),
        supabase.from('bookings').select('id'),
      ]);

      return NextResponse.json({
        projectHost: (process.env.NEXT_PUBLIC_SUPABASE_URL || '')
          .replace('https://', '')
          .replace('.supabase.co', ''),
        // Роль ключа, яким сервер ходить у базу. Має бути service_role.
        serviceKey: keyInfo(process.env.SUPABASE_SERVICE_ROLE_KEY),
        anonKey: keyInfo(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        serviceEqualsAnon:
          Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
          process.env.SUPABASE_SERVICE_ROLE_KEY === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        // Скільки рядків бачить цей клієнт. Якщо ключ справді service_role — RLS обходиться
        // і тут будуть реальні числа. Якщо це anon — RLS ріже і буде 0/мало.
        blockedVisible: blk ? blk.length : null,
        blockedSpots: blk
          ? blk.map((r: { spot: number }) => r.spot).sort((a: number, b: number) => a - b)
          : null,
        bookingsVisible: bk ? bk.length : null,
        blockedReadError: blkErr ? blkErr.message : null,
        bookingsReadError: bkErr ? bkErr.message : null,
      });
    } catch (e) {
      return NextResponse.json({ debugError: e instanceof Error ? e.message : String(e) });
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (session !== 'day' && session !== 'evening')) {
    return NextResponse.json({ error: 'Bad params' }, { status: 400 });
  }

  try {
    const { booked, blocked, closed, closedNote } = await getAvailability(date, session);
    return NextResponse.json({ date, session, booked, blocked, closed, closedNote });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
