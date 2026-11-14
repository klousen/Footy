import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { runDaily } from "@/lib/pipeline";
import { SESSION_COOKIE, sessionValue } from "@/lib/sign";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Manueller Lauf aus dem Dashboard. dry=1: keine Push-Nachrichten.
export async function POST(req: Request) {
  const jar = await cookies();
  if (jar.get(SESSION_COOKIE)?.value !== sessionValue()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const dry = String(form?.get("dry") || "") === "1";
  try {
    await runDaily({ dry });
    return NextResponse.redirect(new URL("/", req.url), 303);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
