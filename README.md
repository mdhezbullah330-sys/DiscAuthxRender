# BENJA HEX Discord OAuth • Render + MongoDB

This build is for Render Web Service + Render Cron + MongoDB Atlas.

## OAuth flow

Discord Verify button → `/api/auth/discord?guildId=...` → Discord OAuth2 consent → callback → authorized guild join → matching verify role → `/success?guildId=...`.

The homepage is not part of the Verify-button flow. The Verify button redirects to Discord's official OAuth2 authorization screen first.

## Configured servers

- Server 1: `1435304112877998131` → verify role `1436054335220875284`
- Server 2: `1535164246852374550` → verify role `1542721497091538970`

## Render

Web service:

```text
Build: npm install && npm run build
Start: npm start
```

Cron:

```text
Build: npm install
Start: npm run cron:refresh
Schedule: 0 * * * *
```

The `render.yaml` file defines both services.

## Environment variables

Add the following in Render. Do not commit secrets.

```text
APP_URL=https://auth.benjahex.qzz.io
DISCORD_CLIENT_ID=1552239931898859550
DISCORD_CLIENT_SECRET=YOUR_NEW_CLIENT_SECRET
DISCORD_REDIRECT_URI=https://auth.benjahex.qzz.io/api/auth/callback
DISCORD_BOT_TOKEN=YOUR_NEW_BOT_TOKEN
DISCORD_ADMIN_IDS=1337766817694744588
MONGODB_URI=YOUR_NEW_MONGODB_ATLAS_URI
MONGODB_DB_NAME=discord_vercel_oauth
TOKEN_ENCRYPTION_KEY=64_HEX_CHARS
AUTH_SECRET=LONG_RANDOM_SECRET
CRON_SECRET=LONG_RANDOM_SECRET
DISCORD_GUILDS_JSON=[{"id":"1435304112877998131","name":"Server 1","roleId":"1436054335220875284"},{"id":"1535164246852374550","name":"Server 2","roleId":"1542721497091538970"}]
```

The credentials previously shared in chat should be rotated before production deployment.

## Discord Developer Portal

OAuth2 → Redirects:

```text
https://auth.benjahex.qzz.io/api/auth/callback
```

The Discord application uses the `identify` and `guilds.join` OAuth2 scopes.

The bot must be in both configured servers and have permission to manage the configured verification roles. The bot role must be above those verification roles.

## Dashboard

Admin dashboard:

```text
https://auth.benjahex.qzz.io/dashboard
```

It shows server members as cards with avatar, username, nickname, server, authorization state and expiry. It includes All servers / per-server filtering, status filters, search by username/nickname/ID, multi-select, Process Selected and Refresh All.

## Role synchronization

OAuth authorization is the source of truth:

```text
active authorization → matching verify role
inactive / re-auth required → matching verify role removed
```

The bot's `verify.js` should perform the live 30-second Discord-side role synchronization. The Render cron job handles due token refreshes and marks failed authorizations as `reauth_required`, after which the bot removes the roles.

## Important bot cleanup

There is an older target-server verification cog that automatically adds role `1542721497091538970` on `GuildMemberAdd` and removes it on its own legacy Verify button. That old cog must be disabled/removed because it conflicts with OAuth-based role synchronization.

Keep the new OAuth-aware `cogs/verify.js` and use `!sendverifypanel` to post the new OAuth panel.
