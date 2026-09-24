# BENJA HEX Discord OAuth Web — Render + MongoDB

Render-ready Next.js website for the Discord OAuth2 verification flow.

## Includes

- Discord OAuth2 with `identify` + `guilds.join`
- Per-server authorization tracking in MongoDB (`authorized_guilds`)
- Server 1: `1435304112877998131` / role `1436054335220875284`
- Server 2: `1535164246852374550` / role `1542721497091538970`
- Automatic access-token refresh when expiry is within 30 hours
- Periodic authorization validation and re-auth detection
- Role add/remove through the normal Discord bot API
- Admin dashboard with server selector, search, status and multi-select processing
- Animated success page
- No raw OAuth tokens displayed in the browser
- Render Blueprint with a web service + hourly cron job

## Deploy on Render

1. Push this folder to a Git repository.
2. In Render, create a new Blueprint from the repository.
3. Render reads `render.yaml` and creates:
   - `benja-hex-auth-web` — Next.js web service
   - `benja-hex-auth-refresh` — hourly cron job
4. On the first Blueprint creation, Render prompts for environment variables marked `sync: false`. Provide the NEW Discord client secret, NEW bot token, MongoDB URI, encryption key, auth secret and cron secret.
5. Attach the custom domain `auth.benjahex.qzz.io` to the web service.
6. In Discord Developer Portal → OAuth2 → Redirects, add exactly:

   `https://auth.benjahex.qzz.io/api/auth/callback`

## Important

The credentials previously pasted in chat should be rotated before production use. Do not commit `.env.local` or real secrets into Git.

Render cron schedules use UTC. This project runs the refresh job every hour. Render guarantees at most one active run per cron job and keeps run logs in the dashboard.
