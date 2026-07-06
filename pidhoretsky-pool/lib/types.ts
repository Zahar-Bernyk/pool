// ───────────────────────────────────────────────────────────────
// Типи предметної області (спільні для клієнта й сервера)
// ───────────────────────────────────────────────────────────────

export type Session = 'day' | 'evening';
export type BookingStatus = 'active' | 'cancelled';

/** Бронювання — рядок у таблиці `bookings`. */
export interface Booking {
  id: string;
  code: string; // 'PM-####'
  name: string;
  phone: string;
  date: string; // 'YYYY-MM-DD'
  session: Session;
  adults: number;
  children: number;
  kids110: number;
  spots: number[]; // номери шезлонгів 1–40
  amount: number; // грн, знімок суми на момент створення
  paid: boolean;
  status: BookingStatus;
  created_at?: string;
}

/** Тіло запиту на створення бронювання (з клієнта). */
export interface CreateBookingInput {
  name: string;
  phone: string;
  date: string;
  session: Session;
  adults: number;
  children: number;
  kids110: number;
  spots: number[];
}

/** Відповідь ендпоінта доступності — лише номери, без персональних даних. */
export interface AvailabilityResponse {
  date: string;
  session: Session;
  booked: number[]; // зайняті на цю дату+сеанс
  blocked: number[]; // глобально недоступні
}
