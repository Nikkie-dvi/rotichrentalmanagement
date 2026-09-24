// Shared server-only helpers for the strict "password + SMS code" checks.
import { createClient } from "@supabase/supabase-js";

export async function hashCode(key: string, code: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${key}:${code}`));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Confirms an email + password pair without touching the caller's session. */
export async function passwordMatches(email: string, password: string) {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const client = createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  return !error;
}

export function phoneVariants(msisdn: string, raw?: string) {
  const local = `0${msisdn.slice(3)}`;
  return Array.from(new Set([msisdn, `+${msisdn}`, local, ...(raw ? [raw.trim()] : [])]));
}

export function randomPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24) + "A1!";
}
