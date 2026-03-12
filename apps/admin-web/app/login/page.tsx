type LoginPageProps = {
  searchParams?: {
    error?: string;
    next?: string;
  };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const nextPath = searchParams?.next ?? "/users";

  return (
    <div className="card hero-card">
      <div className="hero-panel">
        <p className="eyebrow">Internal Admin</p>
        <h1>
          Finance Bot
          <br />
          Control Room
        </h1>
        <p>
          Panel ini dipakai untuk memonitor user, transaksi, health system, observability routing,
          dan operasional subscription dari AI Finance Assistant.
        </p>
        <ul className="hero-list">
          <li>User growth, onboarding, dan access control</li>
          <li>Transaction audit, observability, dan health monitoring</li>
          <li>Operational tools untuk support dan QA internal</li>
        </ul>
      </div>

      <div className="surface hero-form">
        <div>
          <p className="eyebrow">Secure Access</p>
          <h2 style={{ margin: 0 }}>Admin Login</h2>
          <p className="muted" style={{ marginTop: 10 }}>
            Masukkan password admin untuk mengakses panel monitoring.
          </p>
        </div>

        {searchParams?.error ? (
          <p className="tone-danger status-badge" style={{ width: "fit-content" }}>
            {searchParams.error}
          </p>
        ) : null}

        <form action="/auth/login" method="post" className="stack">
          <input type="hidden" name="next" value={nextPath} />
          <div className="field-stack">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Admin password"
              required
            />
          </div>
          <button type="submit" className="button">
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
