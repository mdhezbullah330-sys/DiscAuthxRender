import { NextResponse } from 'next/server';
import { findGuild, appUrl } from '../../../../lib/config';
import { exchangeCode, getMe, joinGuild, addRole } from '../../../../lib/discord';
import { addAuthorizedGuild, upsertOAuthUser } from '../../../../lib/db';
import { setSession, verifyOAuthState } from '../../../../lib/session';

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${appUrl()}/?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: 'Missing OAuth code/state.' },
      { status: 400 }
    );
  }

  const stateData = await verifyOAuthState(state);
  if (!stateData) {
    return NextResponse.json(
      { error: 'Invalid or expired OAuth state.' },
      { status: 400 }
    );
  }

  try {
    const token = await exchangeCode(code);
    const user = await getMe(token.access_token);

    await upsertOAuthUser(user, token);

    const guildId = stateData.guildId
      ? String(stateData.guildId)
      : '';

    if (guildId) {
      const guild = findGuild(guildId);
      if (!guild) {
        throw new Error('Configured guild not found.');
      }

      // Join first. We only mark this guild as authorized after
      // Discord confirms the guild-member operation.
      await joinGuild(user.id, guild.id);

      if (guild.roleId) {
        await addRole(
          guild.id,
          user.id,
          guild.roleId
        );
      }

      await addAuthorizedGuild(
        user.id,
        guild.id
      );
    }

    await setSession(user.id);

    return NextResponse.redirect(
      `${appUrl()}/success`
    );
  } catch (err) {
    const message =
      err?.message ||
      'Authorization failed';

    return NextResponse.redirect(
      `${appUrl()}/?error=${encodeURIComponent(message.slice(0, 180))}`
    );
  }
}
