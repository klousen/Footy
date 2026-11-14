import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { push } from "@/lib/ntfy";
import { runDaily } from "@/lib/pipeline";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Vercel Cron ruft per GET mit "Authorization: Bearer $CRON_SECRET" auf
export async function GET(req: Request) {
  const secret = config.cronSecret();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runDaily());
  } catch (e) {
    await push({ title: "⚠️ Comunio-Bot: Lauf fehlgeschlagen", message: (e as Error).message, tags: ["warning"] }).catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
