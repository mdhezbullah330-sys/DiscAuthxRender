export function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function appUrl() {
  return (process.env.APP_URL || '').replace(/\/$/, '');
}

export function guilds() {
  const raw = required('DISCORD_GUILDS_JSON');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('DISCORD_GUILDS_JSON must be an array');
  return parsed;
}

export function findGuild(id) {
  return guilds().find((g) => String(g.id) === String(id)) || null;
}

export function adminIds() {
  return (process.env.DISCORD_ADMIN_IDS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}
