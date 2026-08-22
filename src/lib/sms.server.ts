// SMS delivery through SMS Leopard (https://smsleopard.com).
// Credentials live in project secrets and are only read at call time.

export type SmsResult = { ok: boolean; status: string; error?: string; id?: string };

/** Normalises a Kenyan number to the 2547XXXXXXXX form SMS Leopard expects. */
export function toKenyanMsisdn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!digits) return null;
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

export async function sendSms(to: string, message: string): Promise<SmsResult> {
  const key = process.env["SMSLEOPARD_API_KEY"];
  const secret = process.env["SMSLEOPARD_API_SECRET"];
  // Falling back to a sender ID the account does not own makes the provider
  // reply "no valid recipients", so default to the live one.
  const sender = process.env["SMSLEOPARD_SENDER_ID"] || "SMS_Leopard";
  if (!key || !secret) return { ok: false, status: "failed", error: "SMS Leopard credentials are not configured" };

  const destination = toKenyanMsisdn(to);
  if (!destination) return { ok: false, status: "failed", error: "Tenant has no phone number" };

  try {
    const res = await fetch("https://api.smsleopard.com/v1/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${key}:${secret}`)}`,
      },
      body: JSON.stringify({
        source: sender,
        message,
        destination: [{ number: destination }],
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: "failed", error: `SMS Leopard [${res.status}]: ${text.slice(0, 300)}` };
    }
    let body: any = {};
    try {
      body = JSON.parse(text);
    } catch {
      /* provider returned non-JSON on success */
    }
    if (body?.success === false) {
      return { ok: false, status: "failed", error: String(body?.message ?? text).slice(0, 300) };
    }
    return { ok: true, status: "sent", id: body?.recipients?.[0]?.id ?? body?.id };
  } catch (e: any) {
    return { ok: false, status: "failed", error: e?.message ?? "SMS request failed" };
  }
}
