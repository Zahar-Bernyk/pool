import { createBrowserClient } from '@supabase/ssr';

// Клієнт для браузера (анонімний ключ). Використовується в адмін-логіні.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
