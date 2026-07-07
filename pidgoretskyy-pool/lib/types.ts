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

// ─── Готель ───────────────────────────────────────────────────────────

/** Бронювання номера — рядок у таблиці `room_bookings`. */
export interface RoomBooking {
  id: string;
  code: string; // 'HR-####'
  name: string;
  phone: string;
  room: number; // номер кімнати
  category: string; // id категорії (знімок)
  check_in: string; // 'YYYY-MM-DD'
  check_out: string; // 'YYYY-MM-DD' (виїзд, не включно)
  nights: number;
  guests: number;
  extra_bed: boolean;
  amount: number; // грн
  paid: boolean;
  status: BookingStatus;
  created_at?: string;
}

/** Тіло запиту на створення бронювання номера (з клієнта). */
export interface CreateRoomBookingInput {
  name: string;
  phone: string;
  category: string; // клієнт обирає категорію; кімнату призначає сервер
  check_in: string;
  check_out: string;
  guests: number;
  extra_bed: boolean;
}
