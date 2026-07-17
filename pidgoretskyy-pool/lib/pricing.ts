import type { Session } from './types';

// ───────────────────────────────────────────────────────────────
// ЦІНОУТВОРЕННЯ (грн) — єдине джерело правди.
// Виконується на сервері при створенні бронювання (клієнту не довіряємо).
//
//                         | дорослий Пн–Пт | дорослий Сб–Нд | дитина Пн–Пт | дитина Сб–Нд
//  Цілий день 10:00–20:00 |      500       |      600       |     300      |     400
//  Вечірнє     17:00–20:00 |      300       |      350       |     150      |     200
//
//  • Діти до 110 см — безкоштовно (не рахуються, шезлонг не займають).
//  • Дорослий абонемент включає шезлонг → шезлонгів стільки ж, скільки дорослих.
//  • Діти до 12 — платні, але без власного шезлонга.
// ───────────────────────────────────────────────────────────────

export function isWeekend(dateStr: string): boolean {
  // Тлумачимо дату як локальний календарний день (без зсуву TZ).
  const d = new Date(dateStr + 'T00:00:00');
  const w = d.getDay();
  return w === 0 || w === 6;
}

export function unitPrice(
  session: Session,
  weekend: boolean,
  kind: 'adult' | 'child'
): number {
  if (session === 'day') {
    if (kind === 'adult') return weekend ? 600 : 500;
    return weekend ? 400 : 300;
  }
  // evening
  if (kind === 'adult') return weekend ? 350 : 300;
  return weekend ? 200 : 150;
}

export function calcTotal(
  session: Session,
  dateStr: string,
  adults: number,
  children: number
): number {
  const w = isWeekend(dateStr);
  return (
    adults * unitPrice(session, w, 'adult') +
    children * unitPrice(session, w, 'child')
  );
}
