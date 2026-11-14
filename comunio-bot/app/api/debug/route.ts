import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionValue } from "@/lib/sign";
import { getDebug } from "@/lib/store";

export const dynamic = "force-dynamic";

// Rohdaten des letzten Laufs (erster Kader-/Marktspieler, offene Angebote), um Feldnamen zu prüfen
export async function GET() {
  const jar = await cookies();
  if (jar.get(SESSION_COOKIE)?.value !== sessionValue()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getDebug());
}
