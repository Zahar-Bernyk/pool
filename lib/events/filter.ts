import type { StaffRole } from './auth';

// ────────────────────────────────────────────────────────────────────────
//  Фільтрація даних за роллю.
//
//  ПРИНЦИП: адміністратор фізично НЕ ОТРИМУЄ контактів гостей і сум.
//  Ці поля видаляються ТУТ, на сервері, перед надсиланням відповіді —
//  а не ховаються в інтерфейсі. Якби ми лише ховали їх у верстці,
//  дані все одно було б видно у вкладці «Мережа» браузера.
// ────────────────────────────────────────────────────────────────────────

/** Повне бронювання — так воно лежить у базі. */
export interface EventBookingRow {
  id: string;
  code: string;
  event_type: string;
  event_date: string;
  end_date: string | null;
  client_name: string | null;
  phone: string | null;
  email: string | null;
  guests_count: number | null;
  venue: string | null;
  price_total: number | null;
  notes: string | null;
  status: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Те, що бачить адміністратор: зайнятість без персональних даних. */
export interface EventBookingPublic {
  id: string;
  code: string;
  event_type: string;
  event_date: string;
  end_date: string | null;
  guests_count: number | null;
  venue: string | null;
  status: string;
  created_by_name: string | null;
  created_at: string;
  /** Ознака, що завдаток внесено — БЕЗ суми. */
  has_deposit: boolean;
  /** Позначка для інтерфейсу: дані приховані за роллю. */
  restricted: true;
}

/**
 * Готує бронювання до надсилання.
 * Для 'superadmin' повертає все; для 'admin' — лише неперсональні поля.
 */
export function filterBooking(
  row: EventBookingRow,
  role: StaffRole,
  hasDeposit = false,
): EventBookingRow | EventBookingPublic {
  if (role === 'superadmin') return row;

  return {
    id: row.id,
    code: row.code,
    event_type: row.event_type,
    event_date: row.event_date,
    end_date: row.end_date,
    guests_count: row.guests_count,
    venue: row.venue,
    status: row.status,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    has_deposit: hasDeposit,
    restricted: true,
  };
}

export function filterBookings(
  rows: EventBookingRow[],
  role: StaffRole,
  depositIds: Set<string> = new Set(),
): (EventBookingRow | EventBookingPublic)[] {
  return rows.map((r) => filterBooking(r, role, depositIds.has(r.id)));
}

/** Назви типів подій для інтерфейсу. */
export const EVENT_TYPES: Record<string, string> = {
  wedding: 'Весілля',
  banquet: 'Банкет',
  photo: 'Фотосесія',
  ceremony: 'Виїзна церемонія',
  corporate: 'Корпоратив',
  other: 'Інше',
};

export const EVENT_STATUSES: Record<string, string> = {
  tentative: 'Попередньо',
  confirmed: 'Підтверджено',
  completed: 'Проведено',
  cancelled: 'Скасовано',
};

/** Майданчики — можна доповнювати. */
export const VENUES = [
  'Банкетна зала',
  'Палац',
  'Відкритий майданчик',
  'Тераса',
  'Басейн',
  'Інше',
];
