// SMS delivery through SMS Leopard (https://smsleopard.com).
// Credentials live in project secrets and are only read at call time.

export type SmsResult = { ok: boolean; status: string; error?: string; id?: string };

const GSM_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà".split(""),
);
const GSM_EXTENDED = new Set("^{}\\[~]|€".split(""));

/** SMS Leopard rejects a whole recipient as `failed` when text contains unsupported Unicode. */
export function toSmsLeopardText(raw: string): string {
  const punctuation: Record<string, string> = {
    "—": "-",
    "–": "-",
    "−": "-",
    "’": "'",
    "‘": "'",
    "“": '"',
    "”": '"',
    "…": "...",
    "•": "-",
    "\u00a0": " ",
  };

  return Array.from(raw.normalize("NFKD"))
    .map((character) => punctuation[character] ?? character)
    .filter((character) => GSM_BASIC.has(character) || GSM_EXTENDED.has(character))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

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

/** Public tenant portal sign-in page appended to tenant messages. */
export const PORTAL_LINK = "homebasemanager.app/tenant/login";

const segments = (text: string) => (text.length <= 160 ? 1 : Math.ceil(text.length / 153));

/**
 * Appends a portal link when it does not push the text into an extra
 * (billable) SMS segment, and when a link isn't already present.
 */
export function withPortalLink(message: string): string {
  if (!message) return message;
  if (message.includes(PORTAL_LINK) || /https?:\/\//i.test(message)) return message;
  const candidate = `${message} Open your portal: ${PORTAL_LINK}`;
  return segments(candidate) > segments(message) ? message : candidate;
}

export async function sendSms(
  to: string,
  message: string,
  options: { portalLink?: boolean } = {},
): Promise<SmsResult> {

  const key = process.env["SMSLEOPARD_API_KEY"];
  const secret = process.env["SMSLEOPARD_API_SECRET"];
  // Falling back to a sender ID the account does not own makes the provider
  // reply "no valid recipients", so default to the live one.
  const sender = process.env["SMSLEOPARD_SENDER_ID"] || "SMS_Leopard";
  if (!key || !secret) return { ok: false, status: "failed", error: "SMS Leopard credentials are not configured" };

  const destination = toKenyanMsisdn(to);
  if (!destination) return { ok: false, status: "failed", error: "Tenant has no phone number" };
  const safeMessage = toSmsLeopardText(message);
  if (!safeMessage) return { ok: false, status: "failed", error: "SMS message has no supported characters" };

  try {
    const res = await fetch("https://api.smsleopard.com/v1/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${key}:${secret}`)}`,
      },
      body: JSON.stringify({
        source: sender,
        message: safeMessage,
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
    const recipient = body?.recipients?.[0];
    if (recipient?.status === "failed") {
      return { ok: false, status: "failed", error: `Delivery rejected for ${recipient.number ?? destination}` };
    }
    return { ok: true, status: recipient?.status ?? "sent", id: recipient?.id ?? body?.id };
  } catch (e: any) {
    return { ok: false, status: "failed", error: e?.message ?? "SMS request failed" };
  }
}
