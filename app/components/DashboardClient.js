'use client';

import { useEffect, useMemo, useState } from 'react';

const Icon = ({ type }) => {
  const paths = {
    grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3.8 19c.8-3.5 2.5-5 5.2-5s4.4 1.5 5.2 5"/><path d="M15 6.5a3 3 0 0 1 0 5.8M17 14.5c2 .9 3 2.2 3.5 4.5"/></>,
    server: <><rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01M8 17h.01"/></>,
    refresh: <><path d="M20 11a8 8 0 1 0 1 4"/><path d="M20 4v7h-7"/></>,
    logout: <><path d="M10 5H5v14h5"/><path d="M14 8l4 4-4 4"/><path d="M9 12h9"/></>,
    search: <><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.7L16.5 9"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    alert: <><path d="M12 4 3.7 19h16.6L12 4Z"/><path d="M12 9v5M12 17h.01"/></>,
    link: <><path d="M10 13.5 14 9.5"/><path d="M7.5 16.5H6a4 4 0 0 1 0-8h3"/><path d="M16.5 7.5H18a4 4 0 0 1 0 8h-3"/></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[type]}
    </svg>
  );
};

function avatarUrl(id, avatar) {
  if (avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=128`;
  const index = Number(BigInt(id) % 5n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

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
  const [statusFilter, setStatusFilter] = useState('all');
  const [stats, setStats] = useState({ all: 0, active: 0, expired: 0, reauth: 0, unauthorized: 0 });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setNotice('');
    setLoaded(false);

    const res = await fetch(
      `/api/admin/users?guildId=${encodeURIComponent(guildId)}`,
      { cache: 'no-store' }
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNotice(data.error || 'Admin access or server configuration is not ready.');
      setLoaded(true);
      return;
    }

    const data = await res.json();
    setGuilds(data.guilds || []);
    setMembers(data.members || []);
    setStats(data.stats || stats);
    setSelected([]);
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, [guildId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return members.filter(x => {
      const matchesStatus = statusFilter === 'all' || x.status === statusFilter;
      const text = `${x.username} ${x.global_name || ''} ${x.nickname || ''} ${x.id}`.toLowerCase();
      return matchesStatus && (!q || text.includes(q));
    });
  }, [members, query, statusFilter]);

  function toggle(id) {
    setSelected(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    );
  }

  async function refreshAll() {
    setBusy(true);
    setNotice('Refreshing due authorizations…');

    const res = await fetch('/api/admin/refresh-all', {
      method: 'POST',
    });

    const data = await res.json().catch(() => ({}));
    setNotice(data.message || (res.ok ? 'Refresh completed.' : 'Refresh failed.'));
    setBusy(false);
    await load();
  }

  async function joinSelected() {
    if (!selected.length) return;

    setBusy(true);
    setNotice('Processing selected users…');

    const res = await fetch('/api/admin/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guildId,
        userIds: selected,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setNotice(data.message || (res.ok ? 'Completed.' : 'Action failed.'));
    setBusy(false);
    await load();
  }

  const shownStats = [
    { key: 'all', label: 'All members', value: stats.all, icon: 'users' },
    { key: 'active', label: 'Active', value: stats.active, icon: 'check' },
    { key: 'expired', label: 'Expired', value: stats.expired, icon: 'clock' },
    { key: 'reauth', label: 'Re-auth required', value: stats.reauth, icon: 'alert' },
    { key: 'unauthorized', label: 'Not authorized', value: stats.unauthorized, icon: 'link' },
  ];

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="side-logo">BH</div>
        <div className="sidebar-brand">
          <strong>BENJA HEX</strong>
          <span>AUTH CONTROL</span>
        </div>

        <div className="side-nav">
          <div className="nav-item active"><Icon type="grid"/><span>Overview</span></div>
          <div className="nav-item"><Icon type="users"/><span>Members</span></div>
          <div className="nav-item"><Icon type="server"/><span>Servers</span></div>
          <div className="nav-item"><Icon type="refresh"/><span>Authorization</span></div>
        </div>

        <a className="logout-link" href="/api/logout">
          <Icon type="logout"/>
          <span>Sign out</span>
        </a>
      </aside>

      <section className="dash-main">
        <header className="dash-header">
          <div>
            <div className="eyebrow">CONTROL CENTER</div>
            <h1>Discord authorization dashboard</h1>
            <p>Manage authorized users, server access, token expiry and verification roles.</p>
          </div>

          <div className="header-actions">
            <a className="ghost-btn" href="/" target="_blank" rel="noreferrer">Open site</a>
            <button className="primary-btn" onClick={refreshAll} disabled={busy}>
              <Icon type="refresh"/> Refresh all
            </button>
          </div>
        </header>

        <div className="stats-grid stats-five">
          {shownStats.map(item => (
            <button
              key={item.key}
              className={`stat-card stat-button ${statusFilter === item.key || (item.key === 'all' && statusFilter === 'all') ? 'selected-stat' : ''}`}
              onClick={() => setStatusFilter(item.key)}
            >
              <div className="stat-icon"><Icon type={item.icon}/></div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </button>
          ))}
        </div>

        <div className="toolbar">
          <div className="select-wrap">
            <Icon type="server"/>
            <select value={guildId} onChange={e => setGuildId(e.target.value)}>
              <option value="all">All servers</option>
              {guilds.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="search-wrap">
            <Icon type="search"/>
            <input
              className="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search username, nickname or Discord ID"
            />
          </div>

          <button
            className="primary-btn small"
            onClick={joinSelected}
            disabled={busy || !selected.length}
          >
            Process selected
          </button>
        </div>

        {notice && <div className="notice">{notice}</div>}

        <section className="member-panel card-panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">MEMBERS</div>
              <h2>{statusFilter === 'all' ? 'All server users' : `${statusFilter.replace('_', ' ')} users`}</h2>
            </div>
            <div className="panel-meta">
              <span>{filtered.length} shown</span>
              <span>{selected.length} selected</span>
            </div>
          </div>

          {!loaded ? (
            <div className="empty-state">Loading member cards…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">No users match the current filters.</div>
          ) : (
            <div className="member-grid">
              {filtered.map(member => {
                const selectedCard = selected.includes(member.id);
                return (
                  <article
                    key={`${member.guildId}:${member.id}`}
                    className={`member-card ${selectedCard ? 'member-card-selected' : ''}`}
                  >
                    <div className="member-card-top">
                      <label className="check-control">
                        <input
                          type="checkbox"
                          checked={selectedCard}
                          onChange={() => toggle(member.id)}
                        />
                        <span />
                      </label>
                      <span className={`status-pill ${member.status}`}>{member.statusLabel}</span>
                    </div>

                    <div className="member-main">
                      <img
                        src={member.avatarUrl || avatarUrl(member.id, member.avatar)}
                        alt=""
                        className="member-avatar"
                      />
                      <div className="member-identity">
                        <strong>{member.global_name || member.username}</strong>
                        <span>{member.nickname || `@${member.username}`}</span>
                      </div>
                    </div>

                    <div className="member-meta-grid">
                      <div><span>Server</span><strong>{member.guildName}</strong></div>
                      <div><span>Expiry</span><strong>{formatExpiry(member.expiresAt)}</strong></div>
                    </div>

                    <div className="member-id-row">{member.id}</div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
