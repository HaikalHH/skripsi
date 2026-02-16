type LoginPageProps = {
  searchParams?: {
    error?: string;
    next?: string;
  };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const nextPath = searchParams?.next ?? "/users";
  return (
    <div className="card" style={{ maxWidth: 420, margin: "80px auto" }}>
      <h1>Admin Login</h1>
      <p>Masukkan password admin untuk mengakses panel monitoring.</p>
      {searchParams?.error ? <p style={{ color: "#b91c1c" }}>{searchParams.error}</p> : null}
      <form action="/auth/login" method="post">
        <input type="hidden" name="next" value={nextPath} />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="Admin password"
          required
          style={{ width: "100%", marginTop: 6, marginBottom: 12 }}
        />
        <button type="submit">Login</button>
      </form>
    </div>
  );
}
