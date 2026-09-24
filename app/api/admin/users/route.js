import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/admin';
import { guilds } from '../../../../lib/config';
import { guildMembers } from '../../../../lib/discord';
import { listUsers } from '../../../../lib/db';

function avatarUrl(id, avatar) {
  if (avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=96`;
  const index = Number(BigInt(id) % 5n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function statusForUser(row, guildId) {
  if (!row) return { status: 'unauthorized', statusLabel: 'Not authorized' };
  if (row.status === 'reauth_required') return { status: 'reauth', statusLabel: 'Re-auth required' };
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return { status: 'expired', statusLabel: 'Expired' };
  const authorizedGuilds = Array.isArray(row.authorized_guilds) ? row.authorized_guilds.map(String) : [];
  if (guildId && !authorizedGuilds.includes(String(guildId))) {
    return { status: 'unauthorized', statusLabel: 'Not authorized for this server' };
  }
  return { status: 'active', statusLabel: 'Active' };
}

export async function GET(request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const selectedGuildId = searchParams.get('guildId') || 'all';
    const configuredGuilds = guilds();
    const selectedGuilds = selectedGuildId === 'all'
      ? configuredGuilds
      : configuredGuilds.filter(g => g.id === selectedGuildId);

    if (!selectedGuilds.length) return NextResponse.json({ error: 'Unknown guild.' }, { status: 400 });

    const authorized = await listUsers();
    const authMap = new Map(authorized.map(x => [x.discord_id, x]));
    const members = [];
    const seen = new Set();

    for (const guild of selectedGuilds) {
      const page = await guildMembers(guild.id);
      for (const member of page) {
        const u = member.user || {};
        const row = authMap.get(u.id);
        const s = statusForUser(row, guild.id);
        const key = selectedGuildId === 'all' ? `${guild.id}:${u.id}` : u.id;
        if (seen.has(key)) continue;
        seen.add(key);
        members.push({
          id: u.id,
          username: u.username || 'Unknown',
          global_name: u.global_name || null,
          nickname: member.nick || null,
          avatarUrl: avatarUrl(u.id, u.avatar),
          guildId: guild.id,
          guildName: guild.name,
          status: s.status,
          statusLabel: s.statusLabel,
          expiresAt: row?.expires_at || null
        });
      }
    }

    const uniqueAuthorized = new Set(authorized.map(x => x.discord_id));
    const active = members.filter(x => x.status === 'active').length;
    const expired = members.filter(x => x.status === 'expired').length;
    const reauth = members.filter(x => x.status === 'reauth').length;

    return NextResponse.json({
      guilds: configuredGuilds.map(({ id, name }) => ({ id, name })),
      members,
      stats: { all: members.length, authorized: uniqueAuthorized.size, active, expired, reauth }
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Unauthorized' }, { status: err?.status || 500 });
  }
}
