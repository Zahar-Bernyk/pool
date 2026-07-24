// Перевірка українського мобільного номера.
// Використовується і на сторінках бронювання, і на сервері — щоб номер
// не можна було підсунути в обхід форми.

/** Коди українських мобільних операторів (без нуля). */
const MOBILE_CODES = [
  '39', // Київстар
  '50', '66', '95', '99', // Vodafone
  '63', '73', '93', // lifecell
  '67', '68', '96', '97', '98', // Київстар
  '91', '92', '94', // Ukrtelecom / PEOPLEnet / Intertelecom
];

/** Чи є послідовність зростаючою або спадною поспіль (1234567 / 7654321). */
function isRun(s: string): boolean {
  let up = true;
  let down = true;
  for (let i = 1; i < s.length; i++) {
    const step = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (step !== 1) up = false;
    if (step !== -1) down = false;
  }
  return up || down;
}

/**
 * Приводить номер до вигляду +380XXXXXXXXX.
 * Повертає null, якщо номер не є справжнім українським мобільним.
 * Приймає будь-який запис: 067 123 45 67, +38 (067) 1234567, 380671234567 тощо.
 */
export function normalizePhone(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '');

  let nine = '';
  if (digits.length === 12 && digits.startsWith('380')) nine = digits.slice(3);
  else if (digits.length === 11 && digits.startsWith('80')) nine = digits.slice(2);
  else if (digits.length === 10 && digits.startsWith('0')) nine = digits.slice(1);
  else if (digits.length === 9) nine = digits;
  else return null;

  // Код оператора має існувати
  if (!MOBILE_CODES.includes(nine.slice(0, 2))) return null;

  // Відсіюємо очевидно вигадані номери: 0670000000, 0671234567, 0677654321
  const rest = nine.slice(2);
  if (/^(\d)\1+$/.test(rest)) return null;
  if (isRun(rest)) return null;

  return `+380${nine}`;
}

export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw) !== null;
}

/** Текст помилки для форми. */
export const PHONE_HINT = 'Вкажіть справжній український номер, напр. 067 123 45 67';
