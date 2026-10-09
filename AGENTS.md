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
- Keep tenant-card invoice reads and confirmed reminder actions in focused components using the existing ledger balance and notification service; this preserves consistent balances and delivery controls.
