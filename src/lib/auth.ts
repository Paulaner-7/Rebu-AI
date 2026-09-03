// HMAC-SHA256 via Web Crypto: funziona in middleware Edge + Node.
// MAI importare chiavi in client components.
import { getServerEnv } from "./env";

export const SESSION_COOKIE = "rebu_session";
const VERSION = "v1";

function secret(): string {
  const { sessionSecret, accessCode } = getServerEnv();
  return sessionSecret || `dev-only:${accessCode}`;
}

async function hmacHex(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession(): Promise<string> {
  const { accessCode } = getServerEnv();
  return `${VERSION}.${await hmacHex(`${VERSION}:${accessCode}`)}`;
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  return safeEqual(token, await signSession());
}

export function checkAccessCode(input: string): boolean {
  const { accessCode } = getServerEnv();
  if (!accessCode || !input) return false;
  return safeEqual(input, accessCode);
}
