import { NextResponse } from 'next/server';
import { getAdminEmail } from '@/lib/supabase/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Закриття днів басейну (санітарний день, приватна подія).
// Усі операції — через службовий ключ; маршрут захищений входом адміна.

// GET /api/closures
export async function GET() {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('pool_closures')
    .select('*')
    .order('start_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ closures: data || [] });
}

// POST /api/closures  { start_date, end_date?, note? }
export async function POST(req: Request) {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const start = String(body?.start_date || '');
  const end = String(body?.end_date || start);
  const note = body?.note ? String(body.note).slice(0, 200) : null;

  if (!DATE_RE.test(start) || !DATE_RE.test(end) || end < start) {
    return NextResponse.json({ error: 'Некоректний діапазон дат' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('pool_closures')
    .insert({ start_date: start, end_date: end, note });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/closures?id=uuid
export async function DELETE(req: Request) {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('pool_closures').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
