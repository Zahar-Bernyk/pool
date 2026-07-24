import { NextResponse } from 'next/server';
import { getAdminEmail } from '@/lib/supabase/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Усі операції — через СЛУЖБОВИЙ ключ (маршрут захищений входом адміна),
// щоб запис/видалення гарантовано проходили незалежно від стану сесії/RLS.

// GET /api/blocked — список заблокованих місць (тільки адмін).
export async function GET() {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase.from('blocked_spots').select('spot');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const blocked = (data || []).map((r: { spot: number }) => r.spot).sort((a, b) => a - b);
  return NextResponse.json({ blocked });
}

// POST /api/blocked:
//   { action: 'set', spots: number[] }  — привести базу ТОЧНО до цього набору
//   { action: 'clear' }                 — зняти всі блокування
//   { spot, action: 'block'|'unblock' } — одиничне (запасний варіант)
export async function POST(req: Request) {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (body.action === 'clear') {
    const { error } = await supabase.from('blocked_spots').delete().gte('spot', 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, blocked: [] });
  }

  // Привести набір заблокованих ТОЧНО до переданого (додати/прибрати різницю).
  // Надійно і для блокування, і для розблокування.
  if (body.action === 'set') {
    const raw = Array.isArray(body.spots) ? body.spots : [];
    const desired = Array.from(
      new Set(
        raw
          .map((n: any) => Math.trunc(Number(n)))
          .filter((n: number) => Number.isFinite(n) && n >= 1 && n <= 52)
      )
    ) as number[];

    const { data: cur, error: readErr } = await supabase.from('blocked_spots').select('spot');
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    const current = new Set<number>((cur || []).map((r: { spot: number }) => r.spot));
    const desiredSet = new Set<number>(desired);
    const toRemove = [...current].filter((s) => !desiredSet.has(s));
    const toAdd = desired.filter((s) => !current.has(s));

    if (toRemove.length) {
      const { error } = await supabase.from('blocked_spots').delete().in('spot', toRemove);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (toAdd.length) {
      const { error } = await supabase.from('blocked_spots').insert(toAdd.map((spot) => ({ spot })));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, blocked: desired.sort((a, b) => a - b) });
  }

  const spot = Math.trunc(Number(body.spot));
  if (!Number.isFinite(spot) || spot < 1 || spot > 52) {
    return NextResponse.json({ error: 'Bad spot' }, { status: 400 });
  }

  if (body.action === 'block') {
    const { error } = await supabase.from('blocked_spots').upsert({ spot }, { onConflict: 'spot' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (body.action === 'unblock') {
    const { error } = await supabase.from('blocked_spots').delete().eq('spot', spot);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: 'Bad action' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, blocked: null });
}
