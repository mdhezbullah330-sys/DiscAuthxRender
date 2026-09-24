'use client';

import { useEffect, useState } from 'react';

const Check = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const Arrow = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;

export default function SuccessPage() {
  const [user, setUser] = useState(null);
  useEffect(() => { fetch('/api/session').then(r => r.json()).then(x => setUser(x.user || null)).catch(() => {}); }, []);
  return (
    <main className="shell success-wrap">
      <section className="success-card">
        <div className="success-glow" />
        <div className="success-icon"><Check /></div>
        <div className="eyebrow">AUTHORIZATION COMPLETE</div>
        <h1>You’re successfully<br/><span>authorized.</span></h1>
        <p>Your Discord account has been securely connected. The verification system can now use your authorized connection and keep its status synchronized.</p>
        {user && <div className="mini-user"><img src={user.avatarUrl} alt=""/><div><strong>{user.global_name || user.username}</strong><small>@{user.username}</small></div></div>}
        <div className="success-actions">
          <a className="primary-btn" href={process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || '#'}>Back to Discord <Arrow /></a>
          <a className="ghost-btn" href="/dashboard">Dashboard</a>
        </div>
      </section>
    </main>
  );
}
