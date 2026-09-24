import { NextResponse } from 'next/server';
import { findGuild, appUrl } from '../../../../lib/config';
import { exchangeCode, getMe, joinGuild, addRole } from '../../../../lib/discord';
import { addAuthorizedGuild, upsertOAuthUser } from '../../../../lib/db';
import { setSession, verifyOAuthState } from '../../../../lib/session';

function errorRedirect(message) {
  return NextResponse.redirect(
    `${appUrl()}/?error=${encodeURIComponent(String(message || 'Authorization failed').slice(0, 180))}`
  );
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return errorRedirect(
      error === 'access_denied'
        ? 'Authorization was cancelled.'
        : error
    );
  }

  if (!code || !state) {
    return errorRedirect('Missing OAuth authorization data.');
  }

  const stateData = await verifyOAuthState(state);
  if (!stateData) {
    return errorRedirect('This authorization link expired. Please try again.');
  }

  const guildId = stateData.guildId ? String(stateData.guildId) : '';

  try {
    const token = await exchangeCode(code);
    const user = await getMe(token.access_token);
    await upsertOAuthUser(user, token);

    if (guildId) {
      const guild = findGuild(guildId);
      if (!guild) throw new Error('Configured server not found.');

      // The user is only marked as authorized for this server after
      // Discord confirms the guild-member operation.
      await joinGuild(user.id, guild.id);

      if (guild.roleId) {
        await addRole(guild.id, user.id, guild.roleId);
      }

      await addAuthorizedGuild(user.id, guild.id);
    }

    await setSession(user.id);

    const successUrl = new URL(`${appUrl()}/success`);
    if (guildId) successUrl.searchParams.set('guildId', guildId);

    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error('[oauth/callback] failed:', err);
    return errorRedirect(err?.message || 'Authorization could not be completed.');
  }
}
