# Roadmap

## Done
- [x] Tenant sign-in by texted code (server + login screen)
- [x] Portal link appended to tenant SMS messages
- [x] Dashboard key metrics (units, occupancy, collected, arrears)
- [x] Tenants grouped by property on the dashboard
- [x] Property performance section (per building)
- [x] Messaging shortcuts made direct from the dashboard
- [x] Sidebar navigation grouped into collapsible SaaS sections
- [x] Dashboard simplified to one portfolio performance chart
- [x] Detailed building performance moved to Properties & Units
- [x] Landlord code and subscription moved to My Account
- [x] SMS credit and recharge tools consolidated in My Account
- [x] Low SMS balance alerts sent to the landlord's saved phone
- [x] Utility readings reorganized into apartment and property feeds
- [x] Tenant pages redesigned for compact mobile screens
- [x] Published-page startup crash removed by lazy-loading Worker-incompatible integrations
- [x] Portfolio Performance and monthly Reports unified in one shared workspace
- [x] Signed-in desktop and phone check of the unified portfolio workspace

## Open
- [ ] Add apartment-specific monthly late-penalty start dates and verify saved settings and date rules.
- [ ] Add separate utility bill tracking to Portfolio.
- [ ] Add natural-language assistant navigation to existing pages.
- [ ] Match the Tenants preview layout with compact All, Paid ahead and Overdue filters.
- [x] Redesign History with screenshot-inspired collection graphs, payment timing statistics and an interactive building; authenticated tabs, month selection, phone/desktop layout and comparison tests verified without recording payments or sending texts.
- [x] Consolidate invoicing, late fees, lease template, automatic texting and logout in My Account; verified phone/desktop panels, legacy redirects, balance cards and logout with sample data, no texts or account changes.
- [x] Refresh homepage with screenshot-inspired rental shortcuts, extra charges, transactions and bottom tabs; preserve existing actions and all-pages role filtering. Verified desktop/phone, light/dark, navigation and existing forms using sample data without changing real accounts.
- [x] Modernize SMS recharge and subscription payment windows; prompts resolve the saved account phone server-side, with atomic cooldown/hourly limits and simulated desktop/phone checks without sending payments.
- [x] Prepare a confirmed, same-apartment room-available notice after tenant move-out, respecting the vacancy-notice switch; simulated move-out, draft and confirmation verified without sending messages.
- [x] Fix My Account SMS credit overlap and add an explicit off-by-default switch for manual, same-property vacancy notices; verified at 360px, 420px and 1280px, with switch on/off checked and no messages sent.
- [x] Make Tenants fit comfortably on phones, separate and highlight search, and reduce the space before tenant cards; verified at 360px, 420px and 1280px with working search and summaries and no horizontal overflow.
- [x] Compact Tenants navigation, summaries and spacing; verified at 420px with no horizontal overflow and working expandable account checks.
- [x] Redesign tenant status cards, property grouping, metrics and search/payment filters; desktop and phone layouts, invoice dialog and zero-balance filter verified.
- [x] Simplify finding lease files for upload and clarify approval labels for self-applications versus landlord-added tenants; active tenant approval labels removed and direct assignment marked approved.
- [x] Assistant edits financial records only; actual refund transfers are out of scope because landlords handle refunds themselves.

## Completed assistant and portfolio updates
- [x] Compare collections with the same date last month in assistant analysis and buddy notices; comparison tests passed.
- [x] Explain portfolio collections, arrears, vacancies and repairs in plain-language detail; signed-in page verified.
- [x] Modernize corner assistant and thinking state; assistant opening/closing verified.
- [x] Add confirmed, audited payment corrections with invoice balance reconciliation (no money transfer).
- [x] Strengthen first-time landlord guidance effects.
- [x] My Account vacancy notices for tenants in the same property; screen verified without sending paid messages.

## Done recently
- [x] Tenant assignment now asks for opening rent paid in months or an exact amount, records it as a payment, and previews credit or balance due separately from the deposit.
- [x] Due-date invoices text tenants their prepaid-credit application and updated balance; logged payments text the resulting credit or arrears.
- [x] Dashboard vacancy, arrears, repair, and collection figures expand into unit, month, ticket, and payment details.
- [x] KPI figures collapsed behind a single drop-down that reveals all four tabs.
