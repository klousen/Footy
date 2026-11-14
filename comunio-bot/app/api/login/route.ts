import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { SESSION_COOKIE, sessionValue } from "@/lib/sign";

export async function POST(req: Request) {
  const form = await req.formData();
  if (String(form.get("password") || "") !== config.dashboardPassword()) {
    return NextResponse.redirect(new URL("/login?e=1", req.url), 303);
  }
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(SESSION_COOKIE, sessionValue(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  });
  return res;
}
