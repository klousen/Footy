import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { executeRec } from "@/lib/execute";
import { push } from "@/lib/ntfy";
import { SESSION_COOKIE, sessionValue, verify } from "@/lib/sign";
import * as store from "@/lib/store";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Aufruf entweder aus ntfy (signierter Link) oder aus dem Dashboard (Session-Cookie + Formular)
export async function POST(req: Request) {
  const url = new URL(req.url);
  let recId = url.searchParams.get("rec") || "";
  let action = url.searchParams.get("a") || "";
  const fromDashboard = !url.searchParams.get("sig");

  if (fromDashboard) {
    const jar = await cookies();
    if (jar.get(SESSION_COOKIE)?.value !== sessionValue()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const form = await req.formData().catch(() => null);
    recId = String(form?.get("rec") || recId);
    action = String(form?.get("a") || action);
  } else if (!verify(`${recId}:${action}`, url.searchParams.get("sig"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }
  if (action !== "approve" && action !== "reject") return NextResponse.json({ error: "bad action" }, { status: 400 });

  const rec = await store.getRec(recId);
  if (!rec) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (rec.status !== "PENDING") {
    return reply(fromDashboard, req, { ok: false, status: rec.status, result: rec.result });
  }
  if (!(await store.lock(recId))) return reply(fromDashboard, req, { ok: false, result: "Wird bereits ausgeführt" });

  const updated =
    action === "reject"
      ? { ...rec, status: "REJECTED" as const, decidedAt: new Date().toISOString(), result: "Abgelehnt" }
      : await executeRec(rec);
  await store.saveRec(updated);

  if (!fromDashboard && action === "approve") {
    await push({
      title: `${updated.status === "EXECUTED" ? "✅" : "⚠️"} ${updated.playerName}`,
      message: updated.result || updated.status,
      tags: [updated.status === "EXECUTED" ? "white_check_mark" : "warning"],
    }).catch(() => {});
  }
  return reply(fromDashboard, req, { ok: updated.status === "EXECUTED" || updated.status === "REJECTED", status: updated.status, result: updated.result });
}

function reply(fromDashboard: boolean, req: Request, body: Record<string, unknown>) {
  if (fromDashboard) return NextResponse.redirect(new URL("/", req.url), 303);
  return NextResponse.json(body);
}
