import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SquadRow } from "@/lib/pipeline";
import { SESSION_COOKIE, sessionValue } from "@/lib/sign";
import * as store from "@/lib/store";
import { fmtMio } from "@/lib/strategy";
import type { Recommendation } from "@/lib/types";

export const dynamic = "force-dynamic";

const POS: Record<string, string> = { keeper: "TW", defender: "ABW", midfielder: "MF", striker: "ST" };
const STATUS: Record<string, string> = {
  PENDING: "offen", REJECTED: "abgelehnt", EXECUTED: "ausgeführt", FAILED: "fehlgeschlagen", EXPIRED: "abgelaufen",
};
const sign = (x: number) => (x >= 0 ? "+" : "") + x.toLocaleString("de-DE");
const dt = (s: string) => new Date(s).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });

function RecCard({ r }: { r: Recommendation }) {
  return (
    <div className="card">
      <header>
        <b>{r.playerName}</b>
        <span className={`tag ${r.type}`}>{r.type === "BUY" ? "Kaufen" : "Verkaufen"}</span>
      </header>
      <div className="muted">
        {r.club} · {POS[r.position] || r.position} · MW {fmtMio(r.marketValue)} ·{" "}
        {r.type === "BUY" ? `Gebot ${fmtMio(r.price)}` : `Preis ${fmtMio(r.price)}`} ·{" "}
        <span className={r.expectedPct >= 0 ? "pos" : "neg"}>{sign(r.expectedPct)} %</span>
      </div>
      <ul>{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
      <div className="actions">
        <form action="/api/decide" method="post">
          <input type="hidden" name="rec" value={r.id} />
          <input type="hidden" name="a" value="approve" />
          <button className="ok">{r.type === "BUY" ? "Bieten" : "Listen"}</button>
        </form>
        <form action="/api/decide" method="post">
          <input type="hidden" name="rec" value={r.id} />
          <input type="hidden" name="a" value="reject" />
          <button className="no">Ablehnen</button>
        </form>
      </div>
    </div>
  );
}

export default async function Dashboard() {
  const jar = await cookies();
  if (jar.get(SESSION_COOKIE)?.value !== sessionValue()) redirect("/login");

  const [summary, recs, squad, balance] = await Promise.all([
    store.getSummary(),
    store.listRecs(60),
    store.getSquadView<SquadRow[]>(),
    store.getBalanceHistory(),
  ]);
  const open = recs.filter((r) => r.status === "PENDING");
  const done = recs.filter((r) => r.status !== "PENDING").slice(0, 20);
  const first = balance[0];
  const total = summary ? summary.credit + summary.squadValue : 0;

  return (
    <main>
      <h1>Comunio-Bot</h1>
      {summary ? (
        <>
          <div className="kpis">
            <div className="kpi"><small>Kontostand</small><b>{fmtMio(summary.credit)}</b></div>
            <div className="kpi"><small>Verfügbar (nach Geboten)</small><b className={summary.available < 0 ? "neg" : ""}>{fmtMio(summary.available)}</b></div>
            <div className="kpi"><small>Kaderwert</small><b>{fmtMio(summary.squadValue)}</b></div>
            <div className="kpi">
              <small>Gesamt{first ? " seit Start" : ""}</small>
              <b>{fmtMio(total)}</b>
              {first && <div className={total - first.credit - first.squadValue >= 0 ? "pos" : "neg"}>{sign(Math.round((total - first.credit - first.squadValue) / 10000) / 100)} Mio</div>}
            </div>
          </div>
          <p className="muted">
            Letzter Lauf: {dt(summary.runAt)}{summary.dry ? " (Testlauf)" : ""} · {summary.marketSize} Spieler auf dem Markt
          </p>
          {summary.warnings.map((w, i) => <div key={i} className="warn">⚠ {w}</div>)}
          {summary.unmapped.length > 0 && (
            <p className="muted">Ohne com-analytics-Daten: {summary.unmapped.join(", ")}</p>
          )}
        </>
      ) : (
        <p className="muted">Noch kein Lauf. Starte einen Testlauf.</p>
      )}

      <div className="actions">
        <form action="/api/run" method="post"><input type="hidden" name="dry" value="1" /><button className="ghost">Testlauf (ohne Push)</button></form>
        <form action="/api/run" method="post"><button className="ghost">Jetzt analysieren</button></form>
        <a href="/api/debug"><button className="ghost" type="button">Rohdaten</button></a>
      </div>

      <h2>Offene Empfehlungen ({open.length})</h2>
      {open.length ? open.map((r) => <RecCard key={r.id} r={r} />) : <p className="muted">Keine offenen Empfehlungen.</p>}

      {squad && (
        <>
          <h2>Kader</h2>
          <div className="scroll">
            <table>
              <thead><tr><th>Spieler</th><th>Pos</th><th>MW</th><th>Kauf</th><th>Pkt</th><th>Prognose</th><th>CA</th><th>Erwartung</th></tr></thead>
              <tbody>
                {squad.sort((a, b) => b.marketValue - a.marketValue).map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}{p.lockedUntil ? " 🔒" : ""}{p.onMarket ? " 🏷️" : ""}</td>
                    <td>{POS[p.position] || p.position}</td>
                    <td>{fmtMio(p.marketValue)}</td>
                    <td className={p.purchasePrice ? (p.marketValue >= p.purchasePrice ? "pos" : "neg") : ""}>{p.purchasePrice ? fmtMio(p.purchasePrice) : "–"}</td>
                    <td>{p.lastPoints ?? "–"}</td>
                    <td>{p.caPrognose ? fmtMio(p.caPrognose) : "–"}</td>
                    <td>{p.caEmpfehlung ?? "–"}</td>
                    <td className={p.expectedPct >= 0 ? "pos" : "neg"}>{sign(p.expectedPct)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">🔒 Kauf-Sperre aktiv · 🏷️ auf dem Transfermarkt</p>
        </>
      )}

      <h2>Verlauf</h2>
      <div className="scroll">
        <table>
          <thead><tr><th>Datum</th><th>Spieler</th><th>Typ</th><th>Preis</th><th>Status</th><th>Ergebnis</th></tr></thead>
          <tbody>
            {done.map((r) => (
              <tr key={r.id}>
                <td>{dt(r.decidedAt || r.createdAt)}</td>
                <td>{r.playerName}</td>
                <td>{r.type === "BUY" ? "Kauf" : "Verkauf"}</td>
                <td>{fmtMio(r.price)}</td>
                <td>{STATUS[r.status]}</td>
                <td className="muted">{r.result || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
