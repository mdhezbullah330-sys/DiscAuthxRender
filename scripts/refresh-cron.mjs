import { refreshAndSyncAuthorizations } from '../lib/maintenance.js';

try {
  const result = await refreshAndSyncAuthorizations();
  console.log(JSON.stringify({ ok: true, ...result }));
  process.exit(0);
} catch (error) {
  console.error('[refresh-cron] failed:', error);
  process.exit(1);
}
