const Shield = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3 5 6v5c0 4.65 2.82 8.48 7 10 4.18-1.52 7-5.35 7-10V6l-7-3Z" fill="none" stroke="currentColor" strokeWidth="1.6"/>
    <path d="m9 12 2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const servers = [
  {
    id: '1435304112877998131',
    name: 'Server 1',
  },
  {
    id: '1535164246852374550',
    name: 'Server 2',
  },
];

export default function Home() {
  return (
    <main className="shell hero-wrap">
      <section className="hero-card">
        <div className="hero-orbit orbit-a" />
        <div className="hero-orbit orbit-b" />

        <div className="brand-mark">
          <Shield />
        </div>

        <div className="eyebrow">
          DISCORD VERIFICATION
        </div>

        <h1>
          Secure authorization.<br />
          <span>Clean verification.</span>
        </h1>

        <p className="hero-copy">
          Connect your Discord account through the official OAuth2 flow,
          then continue to verification with synchronized authorization
          status and role access.
        </p>

        <div className="server-choice-grid">
          {servers.map(server => (
            <a
              key={server.id}
              className="server-choice"
              href={`/api/auth/discord?guildId=${server.id}`}
            >
              <span>
                <strong>{server.name}</strong>
                <small>Authorize &amp; verify</small>
              </span>
              <Arrow />
            </a>
          ))}
        </div>

        <div className="trust-row">
          <span>OAuth2</span>
          <span>Server-side tokens</span>
          <span>Role sync</span>
          <span>Auto refresh</span>
        </div>
      </section>
    </main>
  );
}
