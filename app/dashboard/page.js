import { redirect } from 'next/navigation';
import { requireAdmin } from '../../lib/admin';
import DashboardClient from '../components/DashboardClient';

export default async function DashboardPage() {
  try {
    await requireAdmin();
  } catch {
    redirect('/');
  }

  return <DashboardClient />;
}
