# Text-code sign in for tenants + portal link in messages

## What the tenant sees

On the tenant sign-in page there is a new option: **Text me a code**.

1. The tenant types the phone number their landlord has on file.
2. The system finds that tenant record and texts a 6-digit code to that number.
3. They type the code and land straight in their portal.

Password and email sign-in stay exactly as they are — the code is an extra way in.

If the tenant was added by a landlord but never registered, the code still works: a portal
account is created for them automatically the first time they sign in this way. They can add
an email and password later from the portal.

If the phone number isn't on any landlord's tenant list, they get a clear message pointing
them to "Request access".

## Cost

Login codes are always sent, even when the landlord's message credit is empty, so nobody
gets locked out. They are not charged to the landlord's SMS wallet.

## Portal link in receipts and reminders

Every tenant text that already goes out — payment receipts, rent reminders, before/after due
reminders, charge alerts, late-fee notices, bulk messages — gets a short closing line:

`Open your portal: homebasemanager.app/tenant/login`

The link opens the sign-in page, where they can tap "Text me a code" and get in without
remembering a password. The line is only added when there's room in the message so texts
don't unexpectedly split into two billed parts.

## Safety rules

- Code is 6 digits, valid 10 minutes, single use.
- Maximum 5 wrong attempts, then that code is dead.
- One code per number per minute, 5 per hour.
- Codes are stored hashed, never in plain text, and never returned to the browser.

## Technical notes

**Database (one migration)**
- New table `tenant_login_codes`: `phone` (normalised 2547…), `code_hash`, `expires_at`,
  `attempts`, `consumed_at`, `created_at`. RLS enabled, no anon/authenticated policies —
  reachable only through the service role from server functions. GRANT to `service_role`.
- Index on `(phone, created_at desc)`.

**Server functions** — new `src/lib/tenant-otp.functions.ts` (public, unauthenticated):
- `requestTenantLoginCode({ phone })`: normalise with `toKenyanMsisdn`, look up `tenants` by
  phone variants via `supabaseAdmin`, enforce rate limits, insert hashed code (SHA-256 via
  `crypto`), send with `sendSms` directly (no `sms_charge` call). Returns only
  `{ ok: true, masked }` — never reveals whether more detail exists beyond "no tenant found".
- `verifyTenantLoginCode({ phone, code })`: validate, mark consumed, resolve the tenant's
  `auth_user_id`; if absent, `supabaseAdmin.auth.admin.createUser` with the tenant's email or
  a synthetic `2547…@tenant.homebasemanager.app`, `email_confirm: true`, then store
  `auth_user_id` on the tenant row. Mint a session with
  `admin.generateLink({ type: 'magiclink' })` + `auth.verifyOtp({ token_hash })` on a
  publishable-key client, and return `{ access_token, refresh_token }` for
  `supabase.auth.setSession` — the same pattern `tenantSignInWithPhone` already uses.

**UI** — `src/routes/tenant/login.tsx`: add a "Text me a code" secondary button that switches
the card into a two-step state (phone → code), with resend countdown and back link. No change
to the existing password form.

**Portal link** — add `PORTAL_LINK` and a `withPortalLink(message)` helper in
`src/lib/sms.server.ts` (appends only if the result stays within the current segment budget,
and skips if a link is already present). Apply it at the `sendSms` call sites in
`rent-reminders.server.ts`, `receipts.functions.ts` (4 sites), `bulk-docs.functions.ts`,
`billing-notify.server.ts`, `late-penalties.server.ts`, and `notify-tenants.functions.ts`.

Verify with `bunx tsgo --noEmit` and a preview run of the new sign-in flow.
