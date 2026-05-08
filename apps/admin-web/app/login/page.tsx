type LoginPageProps = {
  searchParams?: {
    error?: string;
    next?: string;
  };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const nextPath = searchParams?.next ?? "/users";

  return (
    <div className="card login-card">
      <h1>Admin Login</h1>

      {searchParams?.error ? (
        <p className="tone-danger status-badge" style={{ width: "fit-content" }}>
          {searchParams.error}
        </p>
      ) : null}

      <form action="/auth/login" method="post" className="stack">
        <input type="hidden" name="next" value={nextPath} />
        <div className="field-stack">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" placeholder="Password" required />
        </div>
        <button type="submit" className="button">
          Login
        </button>
      </form>
    </div>
  );
}
