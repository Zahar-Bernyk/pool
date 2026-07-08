import { createClient } from './server';

/**
 * Перевіряє, чи поточний користувач — авторизований адмін.
 * Повертає email адміна або null.
 *
 * Правило: користувач має бути залогінений у Supabase, і його email має бути
 * у списку ADMIN_EMAILS (через кому). Якщо ADMIN_EMAILS порожній —
 * пускаємо будь-якого авторизованого користувача.
 */
export async function getAdminEmail(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const allow = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allow.length === 0) return user.email; // не налаштовано → пускаємо всіх авторизованих
  return allow.includes(user.email.toLowerCase()) ? user.email : null;
}
