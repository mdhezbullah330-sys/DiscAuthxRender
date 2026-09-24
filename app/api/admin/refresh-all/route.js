import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/admin';
import { listRefreshCandidates, setStatus } from '../../../../lib/db';
import { refreshUser, removeRoleIfPresent } from '../../../../lib/discord';
import { guilds } from '../../../../lib/config';

export async function POST() {
  try {
    await requireAdmin();
    const candidates = await listRefreshCandidates();
    let refreshed = 0;
    let failed = 0;

    for (const row of candidates) {
      try {
        await refreshUser(row.discord_id);
        refreshed++;
      } catch {
        failed++;
        for (const guild of guilds()) {
          if (guild.roleId) await removeRoleIfPresent(guild.id, row.discord_id, guild.roleId);
        }
      }
    }

    return NextResponse.json({ ok: true, message: `Refresh completed: ${refreshed} refreshed, ${failed} requiring re-auth.` });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Unauthorized' }, { status: err?.status || 500 });
  }
}
