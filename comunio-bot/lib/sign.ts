import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config";

export function sign(payload: string): string {
  return createHmac("sha256", config.signingSecret()).update(payload).digest("base64url");
}

export function verify(payload: string, sig: string | null | undefined): boolean {
  if (!sig) return false;
  const a = Buffer.from(sign(payload));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const SESSION_COOKIE = "cb_session";
export const sessionValue = () => sign("dashboard-session-v1");
