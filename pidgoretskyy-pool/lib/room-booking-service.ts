import 'server-only';
import { createAdminClient } from './supabase/admin';
import { generateRoomCode } from './codes';
import {
  ROOM_CATEGORIES,
  categoryById,
  nightsBetween,
  calcRoomTotal,
} from './rooms';
import type { CreateRoomBookingInput, RoomBooking } from './types';

export type RoomBookingError =
  | { ok: false; error: 'INVALID'; message: string }
  | { ok: false; error: 'ROOM_TAKEN'; message: string }
  | { ok: false; error: 'DB'; message: string };

export type RoomBookingResult = { ok: true; booking: RoomBooking } | RoomBookingError;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const ROOM_HOLD_MINUTES = 15;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function validate(input: CreateRoomBookingInput):
  | { ok: true; clean: { name: string; phone: string; category: string; checkIn: string; checkOut: string; guests: number; extraBed: boolean; nights: number; amount: number } }
  | { ok: false; message: string } {
  const name = (input.name || '').trim();
  const phone = (input.phone || '').trim();
  const category = (input.category || '').trim();
  const checkIn = (input.check_in || '').trim();
  const checkOut = (input.check_out || '').trim();
  const guests = Math.trunc(Number(input.guests || 1));
  const extraBed = Boolean(input.extra_bed);

  if (!name) return { ok: false, message: 'Вкажіть імʼя гостя.' };
  const cat = categoryById(category);
  if (!cat) return { ok: false, message: 'Оберіть категорію номера.' };
  if (!DATE_RE.test(checkIn) || !DATE_RE.test(checkOut))
    return { ok: false, message: 'Некоректні дати.' };
  if (checkOut <= checkIn) return { ok: false, message: 'Дата виїзду має бути пізніше за дату заїзду.' };
  if (checkIn < todayStr()) return { ok: false, message: 'Дата заїзду не може бути в минулому.' };
  if (!Number.isFinite(guests) || guests < 1 || guests > 10)
    return { ok: false, message: 'Некоректна кількість гостей.' };

  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1 || nights > 60) return { ok: false, message: 'Некоректна кількість ночей.' };

  const amount = calcRoomTotal(category, nights, extraBed);
  return { ok: true, clean: { name, phone, category, checkIn, checkOut, guests, extraBed, nights, amount } };
}

/** Скасовує неоплачені резерви номерів, яким вийшов час (звільняє кімнати). */
export async function expireStaleRoomHolds(): Promise<void> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - ROOM_HOLD_MINUTES * 60_000).toISOString();
  await supabase
    .from('room_bookings')
    .update({ status: 'cancelled' })
    .eq('status', 'active')
    .eq('paid', false)
    .lt('created_at', cutoff);
}

/** Які кімнати зайняті на діапазон [checkIn, checkOut) — активні бронювання. */
async function takenRooms(checkIn: string, checkOut: string): Promise<Set<number>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('room_bookings')
    .select('room')
    .eq('status', 'active')
    .lt('check_in', checkOut)
    .gt('check_out', checkIn);
  const s = new Set<number>();
  (data || []).forEach((r: { room: number }) => s.add(r.room));
  return s;
}

/**
 * Доступність по категоріях на діапазон дат.
 * Повертає для кожної категорії кількість вільних кімнат.
 */
export async function getRoomAvailability(checkIn: string, checkOut: string) {
  if (!DATE_RE.test(checkIn) || !DATE_RE.test(checkOut) || checkOut <= checkIn) {
    return { categories: ROOM_CATEGORIES.map((c) => ({ id: c.id, available: 0 })) };
  }
  await expireStaleRoomHolds();
  const taken = await takenRooms(checkIn, checkOut);
  return {
    categories: ROOM_CATEGORIES.map((c) => ({
      id: c.id,
      available: c.rooms.filter((r) => !taken.has(r)).length,
    })),
  };
}

/**
 * Створює бронювання номера: призначає вільну кімнату обраної категорії
 * й атомарно вставляє через RPC (з перевіркою перетину дат).
 * @param paid true для ручного/демо; false — «придержати» до оплати.
 */
export async function createRoomBooking(
  input: CreateRoomBookingInput,
  paid: boolean
): Promise<RoomBookingResult> {
  const v = validate(input);
  if (!v.ok) return { ok: false, error: 'INVALID', message: v.message };
  const c = v.clean;

  await expireStaleRoomHolds();

  const cat = categoryById(c.category)!;
  const taken = await takenRooms(c.checkIn, c.checkOut);
  const candidates = cat.rooms.filter((r) => !taken.has(r));
  if (candidates.length === 0) {
    return { ok: false, error: 'ROOM_TAKEN', message: 'На обрані дати немає вільних номерів цієї категорії.' };
  }

  const supabase = createAdminClient();

  // Пробуємо кімнати по черзі — RPC робить фінальну атомарну перевірку.
  for (const room of candidates) {
    const code = generateRoomCode();
    const { data, error } = await supabase.rpc('create_room_booking', {
      p_code: code,
      p_name: c.name,
      p_phone: c.phone,
      p_room: room,
      p_category: c.category,
      p_check_in: c.checkIn,
      p_check_out: c.checkOut,
      p_nights: c.nights,
      p_guests: c.guests,
      p_extra_bed: c.extraBed,
      p_amount: c.amount,
      p_paid: paid,
    });

    if (!error) return { ok: true, booking: data as RoomBooking };

    // Кімнату щойно зайняли — пробуємо наступну.
    if ((error.message || '').includes('ROOM_TAKEN')) continue;
    return { ok: false, error: 'DB', message: error.message || 'DB error' };
  }

  return { ok: false, error: 'ROOM_TAKEN', message: 'На обрані дати немає вільних номерів цієї категорії.' };
}
