<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Use the shared tenant ledger for both due-date invoice SMS and payment receipts, so notices match the balances shown in landlord and tenant accounts.
- Record opening rent during tenant assignment as a payment and offset the first invoice balance; deposit remains separate so both account views show prepaid rent accurately.
- Calculate comparable collection periods through the shared collection-comparison helper in the business timezone; this keeps assistant and portfolio trends consistent.
- Confirm assistant payment corrections through the atomic correct_assistant_payment RPC with authorization, expected-amount checks and an immutable audit trail; recalculate invoice allocations from the same payment/credit pool.
- Keep vacancy announcements manually confirmed and property-scoped through notifyMyTenants; never broaden a vacant unit's notice to other properties.
- Reuse VacancyNotices for the post-move-out draft and My Account, with a user-scoped device preference for its switch; one shared confirmation flow prevents inconsistent audiences and accidental sends.
- Keep tenant-card invoice reads and confirmed reminder actions in focused components using the existing ledger balance and notification service; this preserves consistent balances and delivery controls.
- Resolve recharge payment phones from the authenticated account server-side and claim rate limits atomically before requests; shared registered-phone presentation and database locks prevent arbitrary recipients and concurrent prompt spam.
- Use shared bottom navigation and an all-pages menu sourced from the existing sidebar inventory, preserving role filtering; homepage shortcuts reuse existing payment, property, messaging and invoice-charge workflows without duplicating business logic.
- Mount rental configuration in focused My Account panels and redirect legacy settings URLs there; a single settings surface avoids duplicate controls while preserving saved rules and service calls.
- Keep History visualizations in focused presentation components fed by the existing performance query and collection-comparison helper; dynamically load the Three.js building after hydration to keep browser graphics outside SSR.
