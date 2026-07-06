import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdminEmail } from '@/lib/supabase/auth';

export const dynamic = 'force-dynamic';

// GET /api/blocked — список заблокованих місць (тільки адмін).
export async function GET() {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient();
  const { data, error } = await supabase.from('blocked_spots').select('spot');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const blocked = (data || []).map((r: { spot: number }) => r.spot).sort((a, b) => a - b);
  return NextResponse.json({ blocked });
}

// POST /api/blocked — перемкнути блокування місця: { spot, action: 'block'|'unblock'|'clear' }
export async function POST(req: Request) {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const supabase = createClient();

  if (body.action === 'clear') {
    const { error } = await supabase.from('blocked_spots').delete().gte('spot', 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const spot = Math.trunc(Number(body.spot));
  if (!Number.isFinite(spot) || spot < 1 || spot > 40) {
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

  return NextResponse.json({ ok: true });
}
