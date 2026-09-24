import { headers } from 'next/headers';

const Icon = ({ type }) => {
  const paths = {
    shield: <><path d="M12 3 5 6v5c0 4.65 2.82 8.48 7 10 4.18-1.52 7-5.35 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    arrow: <><path d="M5 12h13"/><path d="m13 6 6 6-6 6"/></>,
    server: <><rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01M8 17h.01"/></>,
    alert: <><path d="M12 4 3.7 19h16.6L12 4Z"/><path d="M12 9v5M12 17h.01"/></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[type]}
    </svg>
  );
};

const servers = [
  { id: '1435304112877998131', name: 'Server 1' },
  { id: '1535164246852374550', name: 'Server 2' },
];

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const error = params?.error || '';

  return (
    <main className="shell hero-wrap">
      <div className="hero-stars" />
      <section className="hero-card premium-hero">
        <div className="hero-orbit orbit-a" />
        <div className="hero-orbit orbit-b" />

        <div className="brand-mark"><Icon type="shield" /></div>

        <div className="eyebrow">BENJA HEX • DISCORD AUTHORIZATION</div>
        <h1>Secure access.<br /><span>Beautiful verification.</span></h1>
        <p className="hero-copy">
          Continue through Discord's official OAuth2 authorization. Your connection,
          server access and verification role are synchronized automatically.
        </p>

        {error && (
          <div className="error-panel">
            <Icon type="alert" />
            <div>
              <strong>Authorization could not be completed</strong>
              <span>{error}</span>
            </div>
          </div>
        )}

        <div className="server-choice-grid">
          {servers.map(server => (
            <a
              key={server.id}
              className="server-choice premium-server-choice"
              href={`/api/auth/discord?guildId=${server.id}`}
            >
              <span>
                <strong>{server.name}</strong>
                <small>Continue with Discord</small>
              </span>
              <Icon type="arrow" />
            </a>
          ))}
        </div>

        <div className="trust-row">
          <span>Official OAuth2</span>
          <span>Encrypted token storage</span>
          <span>Automatic synchronization</span>
        </div>
      </section>
    </main>
  );
}
