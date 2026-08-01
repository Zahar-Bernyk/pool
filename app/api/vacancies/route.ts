import { NextResponse } from 'next/server';
import { getAdminEmail } from '@/lib/supabase/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Дозволені вакансії (значення зберігається в БД у полі position).
const POSITIONS = ['cook', 'waiter', 'kitchen', 'bartender', 'maid', 'cleaner'];

// POST /api/vacancies — ПУБЛІЧНА подача заявки на вакансію.
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_JSON' }, { status: 400 });
  }

  const s = (v: any) => (typeof v === 'string' ? v.trim() : '');
  const position = s(body.position);
  const first_name = s(body.first_name);
  const last_name = s(body.last_name);
  const age = Number(body.age);
  const residence = s(body.residence);
  const experience = s(body.experience);
  const contact = s(body.contact);
  const skills = s(body.skills);
  const resume = s(body.resume); // необовʼязкове

  if (!POSITIONS.includes(position)) {
    return NextResponse.json({ ok: false, error: 'INVALID', message: 'Оберіть вакансію.' }, { status: 400 });
  }
  if (!first_name || !last_name || !residence || !experience || !contact || !skills) {
    return NextResponse.json(
      { ok: false, error: 'INVALID', message: 'Заповніть усі обовʼязкові поля.' },
      { status: 400 },
    );
  }
  if (!Number.isFinite(age) || age < 14 || age > 90) {
    return NextResponse.json({ ok: false, error: 'INVALID', message: 'Вкажіть коректний вік.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from('job_applications').insert({
    position,
    first_name,
    last_name,
    age,
    residence,
    experience,
    contact,
    skills,
    resume: resume || null,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: 'DB', message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// GET /api/vacancies — список заявок (ТІЛЬКИ адмін; містить персональні дані).
export async function GET() {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('job_applications')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ applications: data });
}

// DELETE /api/vacancies?id=... — видалити заявку (ТІЛЬКИ адмін).
export async function DELETE(req: Request) {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('job_applications').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
