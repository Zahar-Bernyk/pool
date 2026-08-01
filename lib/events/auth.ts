import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Ролі персоналу ресторану.
//   admin      — вносить бронювання, бачить зайнятість календаря;
//                НЕ бачить контактів гостей і сум завдатків.
//   superadmin — повний доступ: контакти, платежі, звіти.
export type StaffRole = 'admin' | 'superadmin';

export interface Staff {
  email: string;
  role: StaffRole;
  fullName: string | null;
}

/**
 * Хто зараз працює в системі.
 *
 * Роль читається З БАЗИ службовим ключем — її неможливо підробити
 * з боку браузера чи застосунку. Клієнт надсилає лише сесію;
 * усі рішення про доступ ухвалює сервер.
 *
 * Підтримує два способи автентифікації:
 *   • cookie-сесія — веб-панель;
 *   • заголовок Authorization: Bearer <token> — мобільний застосунок.
 */
export async function getStaff(req?: Request): Promise<Staff | null> {
  let email: string | null = null;

  // 1) Мобільний застосунок: токен у заголовку
  const auth = req?.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    if (token) {
      const admin = createAdminClient();
      const { data } = await admin.auth.getUser(token);
      email = data.user?.email ?? null;
    }
  }

  // 2) Веб-панель: cookie-сесія
  if (!email) {
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      email = data.user?.email ?? null;
    } catch {
      /* поза контекстом запиту — ігноруємо */
    }
  }

  if (!email) return null;

  // Роль беремо з бази службовим ключем (таблиця недоступна ззовні)
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('staff_roles')
    .select('email, role, full_name, active')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (!row || row.active === false) return null;
  if (row.role !== 'admin' && row.role !== 'superadmin') return null;

  return { email: row.email, role: row.role, fullName: row.full_name ?? null };
}

/** Скорочення для маршрутів, доступних лише супер-адміну. */
export async function requireSuperadmin(req?: Request): Promise<Staff | null> {
  const staff = await getStaff(req);
  return staff?.role === 'superadmin' ? staff : null;
}
