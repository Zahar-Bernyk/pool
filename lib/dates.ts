// ───────────────────────────────────────────────────────────────
// Допоміжні функції дат (українська локалізація)
// ───────────────────────────────────────────────────────────────

const MONTHS_SHORT = [
  'січ', 'лют', 'бер', 'кві', 'тра', 'чер',
  'лип', 'сер', 'вер', 'жов', 'лис', 'гру',
];

const MONTHS_FULL = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

const WEEKDAYS_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/** Сьогоднішня дата у форматі 'YYYY-MM-DD' (локальний день). */
export function todayStr(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** Дата через n днів від сьогодні (n може бути від'ємним). */
export function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** '24 чер, Ср' */
export function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${WEEKDAYS_SHORT[d.getDay()]}`;
}

/** Година (за київським часом), після якої на СЬОГОДНІ бронювати вже не можна. */
export const BOOKING_CUTOFF_HOUR = 17;

/** Поточні дата+година за київським часом. Працює і на клієнті, і на сервері (Vercel = UTC). */
function nowKyiv(): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const v = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { year: v('year'), month: v('month'), day: v('day'), hour: v('hour') };
}

/**
 * Найраніша дата, доступна для бронювання ('YYYY-MM-DD').
 * До 17:00 за київським часом — сьогодні; о 17:00 і пізніше — завтра.
 */
export function minBookingDate(): string {
  const { year, month, day, hour } = nowKyiv();
  const d = new Date(Date.UTC(year, month - 1, day));
  if (hour >= BOOKING_CUTOFF_HOUR) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

export { MONTHS_FULL, WEEKDAYS_SHORT };
