import { guilds } from './config';
import { listRefreshCandidates, listActiveUsers, setStatus } from './db';
import { refreshUser, validateAuthorization, removeRoleIfPresent, addRole, isMember } from './discord';

async function removeUserRoles(discordId) {
  for (const guild of guilds()) {
    if (!guild.roleId) continue;
    await removeRoleIfPresent(guild.id, discordId, guild.roleId);
  }
}

export async function refreshAndSyncAuthorizations() {
  const refreshCandidates = await listRefreshCandidates();
  const activeUsers = await listActiveUsers();
  const seen = new Set();

  let refreshed = 0;
  let validated = 0;
  let failed = 0;
  let rolesRemoved = 0;

  for (const row of refreshCandidates) {
    if (seen.has(row.discord_id)) continue;
    seen.add(row.discord_id);

    try {
      await refreshUser(row.discord_id);
      refreshed++;
    } catch {
      failed++;
      await removeUserRoles(row.discord_id);
      rolesRemoved += guilds().filter((g) => g.roleId).length;
    }
  }

  for (const row of activeUsers) {
    if (seen.has(row.discord_id)) continue;

    try {
      await validateAuthorization(row.discord_id);
      validated++;
    } catch {
      failed++;
      await removeUserRoles(row.discord_id);
      rolesRemoved += guilds().filter((g) => g.roleId).length;
    }
  }

  // Make sure active authorized users who are already in a configured guild
  // have the matching role. Missing members are skipped; the bot sync handles
  // new joins too.
  const latestActive = await listActiveUsers();
  for (const row of latestActive) {
    const authorizedGuilds = Array.isArray(row.authorized_guilds)
      ? row.authorized_guilds.map(String)
      : [];

    for (const guild of guilds()) {
      if (!guild.roleId || !authorizedGuilds.includes(String(guild.id))) continue;
      try {
        if (await isMember(guild.id, row.discord_id)) {
          await addRole(guild.id, row.discord_id, guild.roleId);
        }
      } catch {
        // Role synchronization remains best-effort here.
      }
    }
  }

  return {
    refreshCandidates: refreshCandidates.length,
    activeChecked: activeUsers.length,
    refreshed,
    validated,
    failed,
    rolesRemoved,
  };
}
