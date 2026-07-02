import 'server-only';
import { createAdminClient } from './supabase/admin';
import { calcTotal } from './pricing';
import { VALID_SPOT_IDS } from './spots';
import { generateBookingCode } from './codes';
import type { Booking, CreateBookingInput, Session } from './types';

export type BookingError =
  | { ok: false; error: 'INVALID'; message: string }
  | { ok: false; error: 'SPOTS_TAKEN'; spots: number[] }
  | { ok: false; error: 'SPOTS_BLOCKED'; spots: number[] }
  | { ok: false; error: 'DB'; message: string };

export type BookingResult = { ok: true; booking: Booking } | BookingError;

/** Перевіряє та нормалізує вхідні дані бронювання. */
function validate(input: CreateBookingInput):
  | { ok: true; clean: Required<CreateBookingInput> & { session: Session } }
  | { ok: false; message: string } {
  const name = (input.name || '').trim();
  const phone = (input.phone || '').trim();
  const date = (input.date || '').trim();
  const session = input.session;
  const adults = Math.trunc(Number(input.adults));
  const children = Math.trunc(Number(input.children || 0));
  const kids110 = Math.trunc(Number(input.kids110 || 0));
  const spots = Array.isArray(input.spots) ? input.spots.map((n) => Math.trunc(Number(n))) : [];

  if (!name) return { ok: false, message: 'Вкажіть імʼя гостя.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: 'Некоректна дата.' };
  if (session !== 'day' && session !== 'evening')
    return { ok: false, message: 'Некоректний сеанс.' };
  if (!Number.isFinite(adults) || adults < 1 || adults > 12)
    return { ok: false, message: 'Кількість дорослих має бути від 1 до 12.' };
  if (children < 0 || children > 12) return { ok: false, message: 'Некоректна кількість дітей.' };
  if (kids110 < 0 || kids110 > 8) return { ok: false, message: 'Некоректна кількість малюків.' };

  // Ключове правило: шезлонгів стільки ж, скільки дорослих.
  if (spots.length !== adults)
    return { ok: false, message: `Потрібно обрати рівно ${adults} шезлонг(и).` };

  const uniq = new Set(spots);
  if (uniq.size !== spots.length) return { ok: false, message: 'Дубльовані шезлонги.' };
  for (const s of spots) {
    if (!VALID_SPOT_IDS.has(s)) return { ok: false, message: `Шезлонга №${s} не існує.` };
  }

  return { ok: true, clean: { name, phone, date, session, adults, children, kids110, spots } };
}

/**
 * Створює бронювання: рахує суму на сервері й атомарно вставляє через RPC.
 * @param paid  true для демо/ручного бронювання; false щоб «придержати» місця до оплати.
 */
export async function createBooking(
  input: CreateBookingInput,
  paid: boolean
): Promise<BookingResult> {
  const v = validate(input);
  if (!v.ok) return { ok: false, error: 'INVALID', message: v.message };

  const c = v.clean;
  const amount = calcTotal(c.session, c.date, c.adults, c.children); // ← ціна з сервера
  const code = generateBookingCode();
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('create_booking', {
    p_code: code,
    p_name: c.name,
    p_phone: c.phone,
    p_date: c.date,
    p_session: c.session,
    p_adults: c.adults,
    p_children: c.children,
    p_kids110: c.kids110,
    p_spots: c.spots,
    p_amount: amount,
    p_paid: paid,
  });

  if (error) {
    const msg = error.message || '';
    const taken = msg.match(/SPOTS_TAKEN:([\d,]+)/);
    if (taken) return { ok: false, error: 'SPOTS_TAKEN', spots: taken[1].split(',').map(Number) };
    const blocked = msg.match(/SPOTS_BLOCKED:([\d,]+)/);
    if (blocked)
      return { ok: false, error: 'SPOTS_BLOCKED', spots: blocked[1].split(',').map(Number) };
    return { ok: false, error: 'DB', message: msg };
  }

  return { ok: true, booking: data as Booking };
}

/** Зайняті + заблоковані номери для слоту (без персональних даних). */
export async function getAvailability(date: string, session: Session) {
  const supabase = createAdminClient();

  const [{ data: rows }, { data: blockedRows }] = await Promise.all([
    supabase
      .from('bookings')
      .select('spots')
      .eq('status', 'active')
      .eq('date', date)
      .eq('session', session),
    supabase.from('blocked_spots').select('spot'),
  ]);

  const booked = new Set<number>();
  (rows || []).forEach((r: { spots: number[] }) => r.spots.forEach((s) => booked.add(s)));
  const blocked = (blockedRows || []).map((r: { spot: number }) => r.spot);

  return { booked: Array.from(booked).sort((a, b) => a - b), blocked: blocked.sort((a, b) => a - b) };
}
