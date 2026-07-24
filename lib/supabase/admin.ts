import { createClient } from '@supabase/supabase-js';

// ⚠️ ТІЛЬКИ для сервера. Обходить RLS — ніколи не імпортувати в клієнтський код.
// Використовується для перевірки доступності та атомарного створення бронювань.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      // Вимикаємо кеш Next.js для запитів supabase-js. Інакше App Router
      // кешує GET-запити до Supabase, і сайт віддає ЗАСТАРІЛІ дані —
      // нові броні/блокування не зʼявляються (карта показує старий знімок).
      // no-store = сервер завжди читає свіже.
      global: {
        fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    }
  );
}
