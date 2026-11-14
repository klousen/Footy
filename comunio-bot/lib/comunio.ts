// Client für die (inoffizielle) REST-API hinter comunio.de.
//
// Grundlage: Endpunkte, die ein anderes Projekt im August 2026 auf api.comunio.es
// (gleiche Plattform) mitgeschnitten und mit echten Aufrufen bestätigt hat.
// Für comunio.de ist die Basis-URL api.comunio.de. Feldnamen beim ersten Lauf
// über /api/debug prüfen; die Normalisierung unten ist bewusst tolerant.
//
//   POST /login                                                    {username, password}
//   GET  /login/state
//   GET  /users/{userId}/squad
//   GET  /communities/{cid}/users/{uid}/exchangemarket
//   GET  /communities/{cid}/users/{uid}/offers?current            (Parameter ist Pflicht)
//   POST /communities/{cid}/users/{uid}/offers                     {offers:[{price, tradableid, type:"NEW"}]}
//   PUT  /communities/{cid}/users/{uid}/offers/{offerId}           {}  -> Gebot zurückziehen
//   POST /communities/{cid}/users/{uid}/exchangemarket/addplayer   {items:[{tradableId, price}]}
//   POST /communities/{cid}/users/{uid}/exchangemarket/removeplayer {tradableIds:[id]}
//
// Wichtig: Gebote antworten immer mit HTTP 200, das Ergebnis steht in response[i].status.

import { config } from "./config";
import type { Player } from "./types";

export class ComunioError extends Error {}

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export class ComunioClient {
  private token = "";
  userId = "";
  communityId = "";

  constructor(private base = config.comunio.baseUrl) {}

  private headers(auth = true): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Timezone": config.comunio.timezone,
    };
    if (auth) {
      if (!this.token) throw new ComunioError("Nicht eingeloggt");
      h.Authorization = `Bearer ${this.token}`;
    }
    return h;
  }

  private async call(method: string, path: string, body?: unknown, auth = true): Promise<Json> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: this.headers(auth),
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) throw new ComunioError(`${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : {};
  }

  async login(): Promise<void> {
    const data = await this.call(
      "POST",
      "/login",
      { username: config.comunio.username(), password: config.comunio.password() },
      false,
    );
    this.token = data.access_token || data.accessToken || "";
    if (!this.token) throw new ComunioError("Login ohne Token in der Antwort");

    this.userId = config.comunio.userId() || String(data.user?.id ?? data.userId ?? data.user_id ?? "");
    this.communityId = config.comunio.communityId() || String(data.community?.id ?? data.communityId ?? "");

    if (!this.userId || !this.communityId) {
      // Fallback: /login/state liefert Nutzer und Community der aktiven Sitzung
      const st = await this.call("GET", "/login/state");
      this.userId ||= String(st.user?.id ?? st.userId ?? st._embedded?.user?.id ?? "");
      this.communityId ||= String(st.community?.id ?? st.communityId ?? st._embedded?.community?.id ?? "");
    }
    if (!this.userId || !this.communityId) {
      throw new ComunioError("userId/communityId unbekannt: bitte COMUNIO_USER_ID und COMUNIO_COMMUNITY_ID setzen");
    }
  }

  private get cu() {
    return `/communities/${this.communityId}/users/${this.userId}`;
  }

  getSquadRaw() {
    return this.call("GET", `/users/${this.userId}/squad`);
  }
  getMarketRaw() {
    return this.call("GET", `${this.cu}/exchangemarket`);
  }
  getOffersRaw() {
    return this.call("GET", `${this.cu}/offers?current`);
  }

  async placeBid(playerId: string, price: number): Promise<string> {
    const r = await this.call("POST", `${this.cu}/offers`, {
      offers: [{ price: Math.round(price), tradableid: Number(playerId), type: "NEW" }],
    });
    const o = (r.response || [])[0] || {};
    if (o.status !== "OK") throw new ComunioError(`Gebot abgelehnt: ${o.message || JSON.stringify(o).slice(0, 200)}`);
    return String(o.offerid ?? "");
  }

  withdrawBid(offerId: string) {
    return this.call("PUT", `${this.cu}/offers/${offerId}`, {});
  }

  async listForSale(playerId: string, price: number): Promise<void> {
    const r = await this.call("POST", `${this.cu}/exchangemarket/addplayer`, {
      items: [{ tradableId: Number(playerId), price: Math.round(price) }],
    });
    const notPlaced = (r.notPlaced || []).map(String);
    if (notPlaced.includes(String(playerId))) throw new ComunioError("Spieler konnte nicht gelistet werden");
  }

  delistFromSale(playerId: string) {
    return this.call("POST", `${this.cu}/exchangemarket/removeplayer`, { tradableIds: [Number(playerId)] });
  }
}

// ---------- Normalisierung (tolerant gegenüber Schreibweisen) ----------

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

export function normalizePlayer(p: Json): Player {
  return {
    id: String(p.id ?? p.tradableId ?? p.tradableid),
    name: String(p.name ?? p.lastname ?? "?"),
    club: String(p.club?.name ?? p.clubName ?? ""),
    position: String(p.position ?? "").toLowerCase(),
    status: String(p.status ?? "ACTIVE").toUpperCase(),
    statusInfo: p.statusInfo || undefined,
    marketValue: n(p.quotedPrice ?? p.quotedprice ?? p.marketValue) ?? 0,
    lastPoints: n(p.lastPoints ?? p.matchdayPoints),
    totalPoints: n(p.points),
    purchasePrice: n(p.purchaseInfo?.price ?? p.purchasePrice),
    acquiredAt: p.purchaseInfo?.date ?? p.purchaseInfo?.purchaseDate ?? p.purchaseDate ?? null,
    onMarket: Boolean(p.onMarket),
  };
}

export function parseSquad(raw: Json): Player[] {
  return (raw.items || []).map(normalizePlayer);
}

export function parseMarket(raw: Json, ownUserId: string): Player[] {
  return (raw.items || [])
    .map((it: Json) => {
      const pl = it._embedded?.player ?? it.player ?? it.tradable ?? it;
      const owner = it._embedded?.owner ?? it.owner;
      const base = normalizePlayer(pl);
      const ask = n(it.price ?? pl.price ?? pl.recommendedPrice ?? pl.recommendedprice) ?? base.marketValue;
      return {
        ...base,
        askPrice: Math.max(ask, 0),
        owner: owner ? String(owner.name ?? owner.id ?? "") : "Computer",
        _ownerId: owner?.id ? String(owner.id) : "",
      };
    })
    .filter((p: Player & { _ownerId: string }) => p._ownerId !== ownUserId)
    .map(({ _ownerId, ...p }: Player & { _ownerId: string }) => p);
}

export function parseCredit(...raws: Json[]): number {
  for (const r of raws) {
    const c = n(r?.credit ?? r?.budget ?? r?.balance);
    if (c !== null) return c;
  }
  return 0;
}

// Summe aller offenen Kaufgebote: Comunio bucht erst bei Ausführung ab.
export function pendingPurchaseTotal(offersRaw: Json): { total: number; playerIds: string[] } {
  const items = (offersRaw.items || []).filter(
    (o: Json) => String(o.state ?? "").toUpperCase() === "PENDING" && String(o.type ?? "").toUpperCase() === "PURCHASE",
  );
  return {
    total: items.reduce((s: number, o: Json) => s + (n(o.price) ?? 0), 0),
    playerIds: items.map((o: Json) => String(o.tradableid ?? o.tradableId ?? o._embedded?.player?.id ?? "")),
  };
}
