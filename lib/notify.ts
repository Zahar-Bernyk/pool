import 'server-only';

// ───────────────────────────────────────────────────────────────
// Сповіщення адміну в Telegram про нові оплачені бронювання.
// Налаштовується двома змінними середовища (у Vercel):
//   TELEGRAM_BOT_TOKEN — токен бота від @BotFather
//   TELEGRAM_CHAT_ID   — chat_id одержувача (можна кілька через кому)
// Якщо змінні не задані — функція тихо нічого не робить.
// Збій надсилання НІКОЛИ не ламає основний потік бронювання.
// ───────────────────────────────────────────────────────────────

export async function notifyAdmin(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.TELEGRAM_CHAT_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!token || chatIds.length === 0) return;

  await Promise.all(
    chatIds.map(async (chatId) => {
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        });
      } catch {
        // мовчки ігноруємо — сповіщення не має впливати на бронювання
      }
    })
  );
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
function fmtDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Повідомлення про бронювання басейну. */
export function poolBookingMessage(b: {
  code: string;
  name: string;
  phone: string;
  date: string;
  spots: number[] | null;
  adults: number;
  children: number;
  amount: number;
}): string {
  const spots = Array.isArray(b.spots) && b.spots.length ? b.spots.join(', ') : '—';
  return [
    '🏊 <b>Нове бронювання басейну</b>',
    '',
    `Код: <b>${esc(b.code)}</b>`,
    `Ім'я: ${esc(b.name)}`,
    `Телефон: ${esc(b.phone)}`,
    `Дата: ${esc(fmtDate(b.date))}`,
    `Місця: ${esc(spots)}`,
    `Дорослі/діти: ${b.adults}/${b.children}`,
    `Сума: <b>${b.amount} грн</b>`,
  ].join('\n');
}

/** Повідомлення про бронювання номера готелю. */
export function roomBookingMessage(b: {
  code: string;
  name: string;
  phone: string;
  room: number;
  categoryTitle: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number;
  extra_bed: boolean;
  amount: number;
}): string {
  return [
    '🏨 <b>Нове бронювання готелю</b>',
    '',
    `Код: <b>${esc(b.code)}</b>`,
    `Ім'я: ${esc(b.name)}`,
    `Телефон: ${esc(b.phone)}`,
    `Номер: ${esc(b.categoryTitle)} №${b.room}`,
    `Заїзд: ${esc(fmtDate(b.check_in))}`,
    `Виїзд: ${esc(fmtDate(b.check_out))}`,
    `Ночей: ${b.nights}${b.extra_bed ? ' · дод. ліжко' : ''}`,
    `Гостей: ${b.guests}`,
    `Сума: <b>${b.amount} грн</b>`,
  ].join('\n');
}
