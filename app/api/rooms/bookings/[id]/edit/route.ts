import { NextResponse } from 'next/server';
import { getAdminEmail } from '@/lib/supabase/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ALL_ROOMS, ROOM_TO_CATEGORY } from '@/lib/rooms';
import { sendGuestEmail, type MailRow } from '@/lib/email';
import { fmtDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// POST /api/rooms/bookings/[id]/edit — редагування бронювання номера (адмін).
// Можна змінити гостя, номер і дати. Перевіряє перетин з іншими бронюваннями.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from('room_bookings')
    .select('id, code, name, email, room, category, check_in, check_out, nights, guests, extra_bed, amount, status')
    .eq('id', params.id)
    .maybeSingle();

  if (!current) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') patch.name = body.name.trim();
  if (typeof body.phone === 'string') patch.phone = body.phone.trim();
  if (typeof body.amount === 'number' && body.amount >= 0) patch.amount = Math.round(body.amount);
  if (typeof body.guests === 'number' && body.guests > 0) patch.guests = Math.round(body.guests);
  if (typeof body.extra_bed === 'boolean') patch.extra_bed = body.extra_bed;
  if (typeof body.paid === 'boolean') patch.paid = body.paid;

  const newRoom = Number.isInteger(body.room) && ALL_ROOMS.includes(body.room as number)
    ? (body.room as number)
    : current.room;
  const checkIn = isDate(body.check_in) ? body.check_in : current.check_in;
  const checkOut = isDate(body.check_out) ? body.check_out : current.check_out;

  if (checkOut <= checkIn) {
    return NextResponse.json({ error: 'BAD_DATES', message: 'Дата виїзду має бути пізніше за заїзд.' }, { status: 400 });
  }

  const changed = newRoom !== current.room || checkIn !== current.check_in || checkOut !== current.check_out;

  if (changed) {
    const { data: others } = await supabase
      .from('room_bookings')
      .select('id, check_in, check_out')
      .eq('status', 'active')
      .eq('room', newRoom)
      .neq('id', params.id);

    const overlap = (others || []).find((o) => o.check_in < checkOut && o.check_out > checkIn);
    if (overlap) {
      return NextResponse.json(
        { error: 'ROOM_TAKEN', message: `Номер ${newRoom} вже зайнятий на ці дати.` },
        { status: 409 },
      );
    }

    // Перевірка закриттів номера на кожен день проживання
    const { data: closures } = await supabase.from('room_closures').select('room, start_date, end_date, weekdays');
    for (let d = new Date(`${checkIn}T00:00:00Z`); d < new Date(`${checkOut}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      const dow = d.getUTCDay();
      const hit = (closures || []).find(
        (c: { room: number | null; start_date: string; end_date: string; weekdays: number[] | null }) =>
          (c.room === null || c.room === newRoom) &&
          ds >= c.start_date &&
          ds <= c.end_date &&
          (!c.weekdays || c.weekdays.length === 0 || c.weekdays.includes(dow)),
      );
      if (hit) {
        return NextResponse.json({ error: 'ROOM_CLOSED', message: `Номер закритий ${ds}.` }, { status: 409 });
      }
    }

    const nights = Math.round(
      (new Date(`${checkOut}T00:00:00Z`).getTime() - new Date(`${checkIn}T00:00:00Z`).getTime()) / 86_400_000,
    );
    patch.room = newRoom;
    patch.check_in = checkIn;
    patch.check_out = checkOut;
    patch.nights = nights;
    const cat = ROOM_TO_CATEGORY[newRoom];
    if (cat) patch.category = cat.id;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true, unchanged: true });

  const { error } = await supabase.from('room_bookings').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ error: 'DB', message: error.message }, { status: 500 });

  // Повідомляємо гостя, якщо змінилося щось важливе для нього.
  // Квиток у Wallet не оновлюється сам, тому лист — основний канал.
  let mailed = false;
  const guestEmail = (current as { email?: string | null }).email;
  if (guestEmail) {
    const changes: MailRow[] = [];
    if (patch.room !== undefined && patch.room !== current.room) {
      const cat = ROOM_TO_CATEGORY[newRoom];
      changes.push({ label: 'Новий номер', value: `${cat ? cat.title : ''} · №${newRoom}` });
    }
    if (patch.check_in !== undefined && patch.check_in !== current.check_in) {
      changes.push({ label: 'Новий заїзд', value: fmtDate(checkIn) });
    }
    if (patch.check_out !== undefined && patch.check_out !== current.check_out) {
      changes.push({ label: 'Новий виїзд', value: fmtDate(checkOut) });
    }

    if (changes.length > 0) {
      const cur = current as unknown as { code: string; name: string; guests: number };
      const res = await sendGuestEmail({
        to: guestEmail,
        subject: `Зміни у вашому бронюванні · ${cur.code}`,
        heading: 'Готель · зміна бронювання',
        intro: `Вітаємо, ${cur.name}! Ми оновили ваше бронювання. Нижче — актуальні дані.`,
        code: cur.code,
        changed: changes,
        rows: [
          { label: 'Номер', value: `${ROOM_TO_CATEGORY[newRoom]?.title || ''} · №${newRoom}` },
          { label: 'Заїзд', value: fmtDate(checkIn) },
          { label: 'Виїзд', value: fmtDate(checkOut) },
        ],
        footerNote:
          'Якщо у вас є збережений квиток в Apple Wallet, він може показувати попередні дані — ' +
          'орієнтуйтесь на цей лист. Виникли питання? Зателефонуйте нам.',
      });
      mailed = res.ok;
      if (!res.ok) console.error('Email про зміни не надіслано:', res.error);
    }
  }

  return NextResponse.json({ ok: true, mailed });
}
