import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/admin';
import { findGuild, guilds } from '../../../../lib/config';
import { joinGuild, addRole } from '../../../../lib/discord';
import { addAuthorizedGuild, getUser } from '../../../../lib/db';

export async function POST(request) {
  try {
    await requireAdmin();

    const body = await request.json();
    const requestedGuildId = String(
      body.guildId || ''
    );

    const userIds = Array.isArray(body.userIds)
      ? body.userIds
          .map(String)
          .slice(0, 100)
      : [];

    if (!userIds.length) {
      return NextResponse.json(
        { error: 'No users selected.' },
        { status: 400 }
      );
    }

    const targetGuilds = requestedGuildId === 'all'
      ? guilds()
      : [findGuild(requestedGuildId)].filter(Boolean);

    if (!targetGuilds.length) {
      return NextResponse.json(
        { error: 'Unknown guild.' },
        { status: 400 }
      );
    }

    const results = [];

    for (const userId of userIds) {
      const row = await getUser(userId);

      if (!row) {
        results.push({
          userId,
          ok: false,
          message:
            'User has not authorized the app.',
        });
        continue;
      }

      if (row.status !== 'active') {
        results.push({
          userId,
          ok: false,
          message:
            'User authorization is not active.',
        });
        continue;
      }

      const userResults = [];

      for (const guild of targetGuilds) {
        try {
          await joinGuild(
            userId,
            guild.id
          );

          if (guild.roleId) {
            await addRole(
              guild.id,
              userId,
              guild.roleId
            );
          }

          await addAuthorizedGuild(
            userId,
            guild.id
          );

          userResults.push({
            guildId: guild.id,
            ok: true,
            message:
              'Joined and role synchronized.',
          });
        } catch (err) {
          userResults.push({
            guildId: guild.id,
            ok: false,
            message:
              err?.message ||
              'Join failed.',
          });
        }
      }

      const successful = userResults.filter(
        item => item.ok
      ).length;

      results.push({
        userId,
        ok: successful > 0,
        message:
          `${successful}/${targetGuilds.length} server(s) processed.`,
        guilds: userResults,
      });
    }

    const ok = results.filter(
      item => item.ok
    ).length;

    return NextResponse.json({
      ok: true,
      results,
      message:
        `${ok}/${results.length} user(s) processed.`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err?.message ||
          'Unauthorized',
      },
      {
        status:
          err?.status ||
          500,
      }
    );
  }
}
