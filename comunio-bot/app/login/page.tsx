export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main style={{ maxWidth: 360, paddingTop: 80 }}>
      <h1>Comunio-Bot</h1>
      <form action="/api/login" method="post">
        <input type="password" name="password" placeholder="Passwort" autoFocus />
        {e && <p className="warn">Falsches Passwort</p>}
        <div className="actions">
          <button className="ok" type="submit">Anmelden</button>
        </div>
      </form>
    </main>
  );
}
