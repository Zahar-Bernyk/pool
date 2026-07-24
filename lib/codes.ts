// Коди бронювання.
//
// ВАЖЛИВО (безпека): код фактично є «ключем» до бронювання — за ним сервер
// віддає дані про бронювання. Тому код МАЄ бути невгадуваним.
//
// Формат: 6 великих літер англійського алфавіту, напр. 'PM-KRDNVA'.
// Простір: 26^6 = 308 915 776 комбінацій (≈309 млн) — перебір неможливий.
// Джерело випадковості — crypto (а не Math.random).
//
// Чому лише літери, без цифр: у коді ніколи немає цифр, тож «O» не сплутати
// з нулем, а «I» — з одиницею. Код легко продиктувати по телефону.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LENGTH = 6;

// Послідовності, які не хочемо бачити у коді, надісланому гостю.
const BLOCKED = ['FUCK', 'SHIT', 'CUNT', 'DICK', 'COCK', 'PISS', 'SUKA', 'HUY', 'XUY'];

/**
 * Випадкові літери без модульного зсуву.
 * 256 не ділиться на 26 націло, тому «зайві» значення відкидаємо —
 * так усі літери мають однакову ймовірність.
 */
function randomLetters(length: number): string {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length; // 234
  let out = '';
  while (out.length < length) {
    const buf = new Uint8Array(length * 2);
    globalThis.crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      if (buf[i] < max) out += ALPHABET[buf[i] % ALPHABET.length];
    }
  }
  return out;
}

function randomCode(prefix: string): string {
  let body = randomLetters(LENGTH);
  let guard = 0;
  while (BLOCKED.some((w) => body.includes(w)) && guard < 20) {
    body = randomLetters(LENGTH);
    guard++;
  }
  return `${prefix}-${body}`;
}

/** Код бронювання басейну, напр. 'PM-KRDNVA'. */
export function generateBookingCode(): string {
  return randomCode('PM');
}

/** Код бронювання номера готелю, напр. 'HR-ZQMTLB'. */
export function generateRoomCode(): string {
  return randomCode('HR');
}

/**
 * Формат коду для перевірки у маршрутах.
 * Приймає НОВІ коди (6 літер) і СТАРІ (цифрові та літерно-цифрові) —
 * щоб уже видані гостям квитки далі працювали.
 */
export const CODE_PATTERN = /^(PM|HR)-[0-9A-Z]{3,12}$/;
