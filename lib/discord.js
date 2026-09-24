import { required } from './config';
import { decrypt } from './crypto';
import { getUser, updateTokens, setStatus } from './db';

const API = 'https://discord.com/api/v10';
const MAX_RETRIES = 4;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryAfterMs(data, headers, fallback = 1500) {
  const bodySeconds = Number(data?.retry_after);
  if (Number.isFinite(bodySeconds) && bodySeconds > 0) {
    return Math.min(Math.max(bodySeconds * 1000, 250), 15000);
  }

  const headerSeconds = Number(headers?.get?.('retry-after'));
  if (Number.isFinite(headerSeconds) && headerSeconds > 0) {
    return Math.min(Math.max(headerSeconds * 1000, 250), 15000);
  }

  return fallback;
}

async function jsonFetch(url, init = {}, retries = MAX_RETRIES) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    const text = await res.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (res.ok) return data;

    if (res.status === 429 && attempt < retries) {
      await sleep(retryAfterMs(data, res.headers, 1500 + attempt * 750));
      continue;
    }

    const error = new Error(
      data?.message || data?.error_description || `Discord API ${res.status}`
    );
    error.status = res.status;
    error.data = data;
    error.headers = res.headers;
    throw error;
  }
}

export function oauthAuthorizeUrl(state, prompt = 'consent') {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: required('DISCORD_CLIENT_ID'),
    scope: 'identify guilds.join',
    state,
    redirect_uri: required('DISCORD_REDIRECT_URI'),
    prompt,
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: required('DISCORD_REDIRECT_URI'),
  });

  const basic = Buffer.from(
    `${required('DISCORD_CLIENT_ID')}:${required('DISCORD_CLIENT_SECRET')}`
  ).toString('base64');

  return jsonFetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
}

export async function refreshUser(discordId) {
  const row = await getUser(discordId);
  if (!row?.refresh_token_enc) {
    throw new Error('No refresh token available');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: decrypt(row.refresh_token_enc),
  });

  const basic = Buffer.from(
    `${required('DISCORD_CLIENT_ID')}:${required('DISCORD_CLIENT_SECRET')}`
  ).toString('base64');

  try {
    const token = await jsonFetch(`${API}/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    return updateTokens(discordId, token);
  } catch (error) {
    await setStatus(discordId, 'reauth_required');
    throw error;
  }
}

export async function accessTokenFor(discordId, force = false) {
  let row = await getUser(discordId);
  if (!row) throw new Error('Authorized user not found');

  const dueAt = Date.now() + 30 * 60 * 60 * 1000;
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;

  if (force || !expiresAt || expiresAt <= dueAt) {
    row = await refreshUser(discordId);
  }

  return {
    row,
    accessToken: decrypt(row.access_token_enc),
  };
}

export async function getMe(accessToken) {
  return jsonFetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function validateAuthorization(discordId) {
  let row = await getUser(discordId);
  if (!row) throw new Error('Authorized user not found');

  try {
    const current = await accessTokenFor(discordId, false);
    await getMe(current.accessToken);
    return current.row;
  } catch (firstError) {
    try {
      const refreshed = await accessTokenFor(discordId, true);
      await getMe(refreshed.accessToken);
      return refreshed.row;
    } catch (secondError) {
      await setStatus(discordId, 'reauth_required');
      throw secondError || firstError;
    }
  }
}

export async function joinGuild(discordId, guildId) {
  const botToken = required('DISCORD_BOT_TOKEN');
  const guildPath = `${API}/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordId)}`;
  const { accessToken } = await accessTokenFor(discordId, false);

  return jsonFetch(guildPath, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ access_token: accessToken }),
  });
}

export async function addRole(guildId, userId, roleId) {
  return jsonFetch(
    `${API}/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${required('DISCORD_BOT_TOKEN')}`,
      },
    }
  );
}

export async function removeRole(guildId, userId, roleId) {
  return jsonFetch(
    `${API}/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bot ${required('DISCORD_BOT_TOKEN')}`,
      },
    }
  );
}

export async function removeRoleIfPresent(guildId, userId, roleId) {
  try {
    await removeRole(guildId, userId, roleId);
  } catch (error) {
    if (![404, 10007, 10011].includes(error.status)) {
      throw error;
    }
  }
}

export async function guildMembers(guildId) {
  const all = [];
  let after = '0';

  while (true) {
    const url = new URL(`${API}/guilds/${guildId}/members`);
    url.searchParams.set('limit', '1000');
    if (after !== '0') url.searchParams.set('after', after);

    const page = await jsonFetch(url.toString(), {
      headers: {
        Authorization: `Bot ${required('DISCORD_BOT_TOKEN')}`,
      },
    });

    all.push(...(page || []));
    if (!page || page.length < 1000) break;
    after = page[page.length - 1].user.id;
  }

  return all;
}

export async function isMember(guildId, userId) {
  try {
    await jsonFetch(
      `${API}/guilds/${guildId}/members/${userId}`,
      {
        headers: {
          Authorization: `Bot ${required('DISCORD_BOT_TOKEN')}`,
        },
      }
    );
    return true;
  } catch (error) {
    if (error.status === 429) throw error;
    return false;
  }
}
