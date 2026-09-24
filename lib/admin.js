import { getSession } from './session';
import { adminIds } from './config';

export async function requireAdmin() {
  const session = await getSession();
  if (!session?.userId || !adminIds().includes(session.userId)) {
    const error = new Error('Admin access required');
    error.status = 403;
    throw error;
  }
  return session;
}
