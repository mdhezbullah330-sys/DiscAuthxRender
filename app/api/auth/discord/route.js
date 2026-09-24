import { NextResponse } from 'next/server';
import { findGuild } from '../../../../lib/config';
import { issueOAuthState } from '../../../../lib/session';
import { oauthAuthorizeUrl } from '../../../../lib/discord';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const guildId = searchParams.get('guildId') || '';

  if (guildId && !findGuild(guildId)) {
    return NextResponse.json({ error: 'Unknown guild.' }, { status: 400 });
  }

  const state = await issueOAuthState(guildId ? { guildId } : {});
  return NextResponse.redirect(oauthAuthorizeUrl(state));
}
