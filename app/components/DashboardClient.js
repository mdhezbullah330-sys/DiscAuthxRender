'use client';

import { useEffect, useMemo, useState } from 'react';

const Icon = ({ type }) => {
  const paths = {
    grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 19c.4-3.3 2.4-5 6-5s5.6 1.7 6 5"/><path d="M16 6.5a3 3 0 0 1 0 5.8M18 14c2 .6 3.1 2 3.5 4"/></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.7-4.2L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.7 4.2L21 15"/><path d="M21 20v-5h-5"/></>,
    server: <><rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="14" width="16" height="6" rx="1"/><circle cx="8" cy="7" r="1"/><circle cx="8" cy="17" r="1"/></>,
    logout: <><path d="M10 5H5v14h5"/><path d="M14 8l4 4-4 4"/><path d="M9 12h9"/></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
};

function formatExpiry(value) {
  if (!value) return '—';
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function DashboardClient() {
  const [guilds, setGuilds] = useState([]);
  const [guildId, setGuildId] = useState('all');
  const [members, setMembers] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [stats, setStats] = useState({ all: 0, active: 0, expired: 0, reauth: 0 });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function load() {
    setNotice('');
    const res = await fetch(`/api/admin/users?guildId=${encodeURIComponent(guildId)}`);
    if (!res.ok) { setNotice('Admin access or server configuration is not ready.'); return; }
    const data = await res.json();
    setGuilds(data.guilds || []);
    setMembers(data.members || []);
    setStats(data.stats || stats);
    setSelected([]);
  }

  useEffect(() => { load(); }, [guildId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(x => `${x.username} ${x.global_name || ''} ${x.nickname || ''} ${x.id}`.toLowerCase().includes(q));
  }, [members, query]);

  function toggle(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  async function refreshAll() {
    setBusy(true); setNotice('Refreshing due authorizations…');
    const res = await fetch('/api/admin/refresh-all', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setNotice(data.message || (res.ok ? 'Refresh completed.' : 'Refresh failed.'));
    setBusy(false); load();
  }

  async function joinSelected() {
    if (!selected.length) return;
    setBusy(true); setNotice('Processing selected users…');
    const res = await fetch('/api/admin/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guildId, userIds: selected }) });
    const data = await res.json().catch(() => ({}));
    setNotice(data.message || (res.ok ? 'Completed.' : 'Action failed.'));
    setBusy(false); load();
  }

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="side-logo">DV</div>
        <div className="side-nav"><div className="nav-item active"><Icon type="grid"/><span>Overview</span></div><div className="nav-item"><Icon type="users"/><span>Members</span></div><div className="nav-item"><Icon type="server"/><span>Servers</span></div><div className="nav-item"><Icon type="refresh"/><span>Authorization</span></div></div>
        <a className="logout-link" href="/api/logout"><Icon type="logout"/><span>Sign out</span></a>
      </aside>
      <section className="dash-main">
        <header className="dash-header"><div><div className="eyebrow">CONTROL CENTER</div><h1>Discord verification dashboard</h1></div><button className="ghost-btn" onClick={refreshAll} disabled={busy}><Icon type="refresh"/> Refresh all</button></header>
        <div className="stats-grid"><div className="stat-card"><span>All members</span><strong>{stats.all}</strong></div><div className="stat-card"><span>Active</span><strong>{stats.active}</strong></div><div className="stat-card"><span>Expired</span><strong>{stats.expired}</strong></div><div className="stat-card"><span>Re-auth required</span><strong>{stats.reauth}</strong></div></div>
        <div className="toolbar"><div className="select-wrap"><Icon type="server"/><select value={guildId} onChange={e => setGuildId(e.target.value)}><option value="all">All servers</option>{guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div><input className="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search username, nickname or Discord ID"/><button className="primary-btn small" onClick={joinSelected} disabled={busy || !selected.length}>Process selected</button></div>
        {notice && <div className="notice">{notice}</div>}
        <section className="member-panel"><div className="panel-head"><div><div className="eyebrow">MEMBERS</div><h2>Server users</h2></div><span>{filtered.length} shown</span></div><div className="member-table"><div className="table-row table-head"><div></div><div>User</div><div>Server</div><div>Authorization</div><div>Expiry</div><div></div></div>{filtered.map(m => <div className="table-row" key={`${m.guildId || 'all'}-${m.id}`}><div><input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} disabled={guildId === 'all'}/></div><div className="user-cell"><img src={m.avatarUrl} alt=""/><div><strong>{m.global_name || m.username}</strong><small>{m.nickname ? m.nickname : `@${m.username}`}</small></div></div><div><span className="server-pill">{m.guildName || 'Multiple'}</span></div><div><span className={`status-pill ${m.status}`}>{m.statusLabel}</span></div><div>{formatExpiry(m.expiresAt)}</div><div className="mono">{m.id}</div></div>)}</div></section>
      </section>
    </main>
  );
}
