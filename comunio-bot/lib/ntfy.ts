// Push-Nachrichten über ntfy (App für iOS/Android, Thema abonnieren).
// Jede Empfehlung kommt als eigene Nachricht mit Buttons; ein Tipp auf den Button
// schickt einen signierten POST an /api/decide, ohne dass sich eine Seite öffnet.

import { config } from "./config";
import { sign } from "./sign";
import { fmtMio } from "./strategy";
import type { Recommendation } from "./types";

interface NtfyAction {
  action: "view" | "http";
  label: string;
  url: string;
  method?: string;
  clear?: boolean;
}

export async function push(msg: {
  title: string;
  message: string;
  tags?: string[];
  priority?: number;
  click?: string;
  actions?: NtfyAction[];
}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.ntfy.token) headers.Authorization = `Bearer ${config.ntfy.token}`;
  const res = await fetch(config.ntfy.server, {
    method: "POST",
    headers,
    body: JSON.stringify({ topic: config.ntfy.topic(), ...msg }),
  });
  if (!res.ok) throw new Error(`ntfy ${res.status}: ${await res.text()}`);
}

export function decideUrl(recId: string, action: "approve" | "reject") {
  return `${config.appUrl()}/api/decide?rec=${encodeURIComponent(recId)}&a=${action}&sig=${sign(`${recId}:${action}`)}`;
}

export async function pushRecommendation(r: Recommendation) {
  const isBuy = r.type === "BUY";
  const lines = [
    `${r.club} · ${r.position} · MW ${fmtMio(r.marketValue)}`,
    isBuy
      ? `Gebot ${fmtMio(r.price)} · erwartet ${r.expectedPct >= 0 ? "+" : ""}${r.expectedPct} % (≈ ${fmtMio(r.expectedProfit)} Gewinn)`
      : `Verkaufen für ${fmtMio(r.price)} · erwartet ${r.expectedPct} %`,
    ...r.reasons.slice(0, 4).map((x) => `• ${x}`),
  ];
  await push({
    title: `${isBuy ? "Kaufen" : "Verkaufen"}: ${r.playerName}`,
    message: lines.join("\n"),
    tags: [isBuy ? "moneybag" : "outbox_tray"],
    priority: 4,
    click: `${config.appUrl()}/`,
    actions: [
      { action: "http", label: isBuy ? `✅ Bieten ${fmtMio(r.price)}` : `✅ Listen ${fmtMio(r.price)}`, url: decideUrl(r.id, "approve"), method: "POST", clear: true },
      { action: "http", label: "❌ Ablehnen", url: decideUrl(r.id, "reject"), method: "POST", clear: true },
      { action: "view", label: "Dashboard", url: `${config.appUrl()}/` },
    ],
  });
}
