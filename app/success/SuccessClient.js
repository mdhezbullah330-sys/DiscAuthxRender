'use client';

import { useEffect, useMemo, useState } from 'react';

const Icon = ({ type }) => {
  const paths = {
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.7L16.5 9"/></>,
    arrow: <><path d="M5 12h13"/><path d="m13 6 6 6-6 6"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.65 2.82 8.48 7 10 4.18-1.52 7-5.35 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    user: <><circle cx="12" cy="8" r="3.2"/><path d="M5.8 20c.9-3.4 3-5 6.2-5s5.3 1.6 6.2 5"/></>,
    server: <><rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01M8 17h.01"/></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[type]}
    </svg>
  );
};

export default function SuccessClient() {
  const [user, setUser] = useState(null);
  const [guildId, setGuildId] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setGuildId(params.get('guildId'));

    fetch('/api/session', { cache: 'no-store' })
      .then(r => r.json())
      .then(x => setUser(x.user || null))
      .catch(() => {});
  }, []);

  const backToDiscord = useMemo(() => {
    const selected = guildId || user?.lastAuthorizedGuild;
    return selected
      ? `https://discord.com/channels/${selected}`
      : 'https://discord.com/app';
  }, [guildId, user]);

  return (
    <main className="shell success-wrap">
      <div className="success-grid" />
      <section className="success-card premium-success">
        <div className="success-orbit orbit-a" />
        <div className="success-orbit orbit-b" />

        <div className="success-icon success-check">
          <Icon type="check" />
        </div>

        <div className="eyebrow">AUTHORIZATION COMPLETE</div>
        <h1>
          You’re successfully<br />
          <span>authorized.</span>
        </h1>

        <p>
          Your Discord account is connected through the official OAuth2 flow.
          Your authorization status is now synchronized with verification access.
        </p>

        {user && (
          <div className="verified-user-card">
            <img src={user.avatarUrl} alt="" />
            <div className="verified-user-main">
              <strong>{user.global_name || user.username}</strong>
              <span>@{user.username}</span>
            </div>
            <div className="verified-badge">
              <Icon type="check" />
              <span>Authorized</span>
            </div>
          </div>
        )}

        <div className="success-detail-grid">
          <div className="success-detail">
            <Icon type="shield" />
            <div><span>Authorization</span><strong>Active</strong></div>
          </div>
          <div className="success-detail">
            <Icon type="server" />
            <div><span>Verification</span><strong>Role synchronized</strong></div>
          </div>
          <div className="success-detail">
            <Icon type="user" />
            <div><span>Account</span><strong>Discord linked</strong></div>
          </div>
        </div>

        <div className="success-actions">
          <a className="primary-btn" href={backToDiscord}>
            Back to Discord <Icon type="arrow" />
          </a>
          <a className="ghost-btn" href="/dashboard">
            Control dashboard
          </a>
        </div>

        <div className="success-footnote">
          You can close this page or return to Discord. Your authorization remains synchronized automatically.
        </div>
      </section>
    </main>
  );
}
