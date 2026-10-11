// Shared guard for the scheduled-job routes under /api/public/hooks/*.
// These endpoints are reachable by anyone on the internet, so each one must
// prove it was called by our own scheduler (pg_cron) via the CRON_SECRET.
// The secret is sent as `Authorization: Bearer <CRON_SECRET>` or `?token=`.

export function assertCronCaller(request: Request): Response | null {
  const expected = process.env["CRON_SECRET"];
  if (!expected) {
    // Misconfigured server — fail closed rather than open.
    return Response.json({ ok: false, error: "cron not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const provided = bearer || url.searchParams.get("token") || "";

  if (provided !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null; // caller verified — continue
}
