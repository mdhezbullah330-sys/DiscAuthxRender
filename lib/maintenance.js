import { guilds } from './config';
import { listRefreshCandidates, setStatus } from './db';
import { refreshUser, removeRoleIfPresent, addRole, isMember } from './discord';

async function removeUserRoles(discordId) {
  let removed = 0;
  for (const guild of guilds()) {
    if (!guild.roleId) continue;
    try {
      await removeRoleIfPresent(guild.id, discordId, guild.roleId);
      removed++;
    } catch (error) {
      console.error(`[refresh] role removal failed for ${discordId} in ${guild.id}:`, error.message);
    }
  }
  return removed;
}

export async function refreshAndSyncAuthorizations() {
  const candidates = await listRefreshCandidates();
  let refreshed = 0;
  let failed = 0;
  let rolesRemoved = 0;
  let rolesSynced = 0;

  for (const row of candidates) {
    try {
      await refreshUser(row.discord_id);
      refreshed++;
    } catch (error) {
      failed++;
      await setStatus(row.discord_id, 'reauth_required').catch(() => {});
      rolesRemoved += await removeUserRoles(row.discord_id);
    }
  }

  const freshCandidates = await listRefreshCandidates().catch(() => []);
  for (const row of freshCandidates) {
    if (row.status !== 'active') continue;
  }

  // Sync active records whose tokens were refreshed during this run.
  // Status changes are the source of truth; the bot also performs its own
  // periodic synchronization.
  for (const row of candidates) {
    const current = await import('./db').then(m => m.getUser(row.discord_id)).catch(() => null);
    if (!current || current.status !== 'active') continue;

    const authorizedGuilds = Array.isArray(current.authorized_guilds)
      ? current.authorized_guilds.map(String)
      : [];

    for (const guild of guilds()) {
      if (!guild.roleId || !authorizedGuilds.includes(String(guild.id))) continue;
      try {
        if (await isMember(guild.id, row.discord_id)) {
          await addRole(guild.id, row.discord_id, guild.roleId);
          rolesSynced++;
        }
      } catch (error) {
        console.error(`[refresh] role sync failed for ${row.discord_id} in ${guild.id}:`, error.message);
      }
    }
  }

  return {
    refreshCandidates: candidates.length,
    refreshed,
    failed,
    rolesRemoved,
    rolesSynced,
  };
}
