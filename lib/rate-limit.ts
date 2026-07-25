// Просте обмеження частоти запитів для публічних маршрутів.
// Захищає від перебору кодів бронювання (напр. спроби вгадати чужий квиток).
//
// Обмеження зберігається в памʼяті процесу. На Vercel інстансів може бути кілька,
// тож ліміт не абсолютний — але він знижує швидкість перебору на порядки,
// що й потрібно: замість тисяч запитів на секунду зловмисник отримає одиниці.

type Hit = { count: number; resetAt: number };

const buckets = new Map<string, Hit>();
const MAX_KEYS = 5000; // щоб памʼять не росла нескінченно

/** IP клієнта з заголовків проксі Vercel. */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get('x-forwarded-for')?.split(',')[0].trim() ||
    h.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Повертає true, якщо запит дозволено.
 * @param key   унікальний ключ (напр. `wallet:1.2.3.4`)
 * @param limit скільки запитів дозволено за вікно
 * @param windowMs довжина вікна в мілісекундах
 */
export function allow(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();

  if (buckets.size > MAX_KEYS) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
    if (buckets.size > MAX_KEYS) buckets.clear();
  }

  const hit = buckets.get(key);
  if (!hit || hit.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (hit.count >= limit) return false;
  hit.count++;
  return true;
}

/** Готова відповідь «занадто багато запитів». */
export function tooMany(): Response {
  return new Response(JSON.stringify({ error: 'TOO_MANY_REQUESTS' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
  });
}
