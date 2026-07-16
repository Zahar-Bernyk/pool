import { createClient } from '@supabase/supabase-js';

// ⚠️ ТІЛЬКИ для сервера. Обходить RLS — ніколи не імпортувати в клієнтський код.
// Використовується для перевірки доступності та атомарного створення бронювань.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
