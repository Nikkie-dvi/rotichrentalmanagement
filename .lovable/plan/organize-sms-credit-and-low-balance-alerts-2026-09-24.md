# Organize SMS credit and low-balance alerts

## Changes
- Remove the SMS credit/recharge card from the tenant messaging page and any duplicate payment-settings location.
- Place SMS balance, recharge requests, and recent SMS activity in **My Account**, beside subscription information.
- Update dashboard SMS shortcuts so low-credit actions open the SMS credit section in My Account, while messaging actions still open SMS Tenants.
- Add a deduplicated low-balance text alert to the landlord’s saved phone number when sending reduces the wallet below the safe threshold.
- Keep managers able to send tenant messages using the landlord wallet, but keep balance/recharge/account details landlord-only.
- Audit the connected SMS sending paths for inconsistent charging, balance refreshes, links, and error handling, and fix related issues found.

## Technical details
- Reuse the existing SMS wallet card and wallet query rather than introducing another balance screen.
- Centralize low-balance alert logic server-side, send it without charging the tenant-message wallet, and record alerts to prevent repeated texts.
- Apply the alert check to manual broadcasts, automatic reminders, invoices, receipts, and bulk document texts that charge SMS credit.
- Validate with focused tests/type checks and the current build/error logs.
