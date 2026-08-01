import { redirect } from 'next/navigation';
import { getAdminEmail } from '@/lib/supabase/auth';
import AdminDashboard from './AdminDashboard';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const email = await getAdminEmail();
  // Немає сесії або email не у списку ADMIN_EMAILS → на сторінку входу.
  if (!email) redirect('/admin/login');

  return <AdminDashboard email={email} />;
}
