import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import { getUser } from '../../../lib/db';

function avatarUrl(id, avatar) {
  if (avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=128`;
  const index = Number(BigInt(id) % 5n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });
  const row = await getUser(session.userId);
  if (!row) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      id: row.discord_id,
      username: row.username,
      global_name: row.global_name,
      nickname: row.nickname,
      avatarUrl: avatarUrl(row.discord_id, row.avatar),
      status: row.status,
      expiresAt: row.expires_at
    }
  });
}
