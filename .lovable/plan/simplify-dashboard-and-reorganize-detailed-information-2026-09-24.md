# Simplify dashboard and reorganize detailed information

## Dashboard
- Remove the landlord code card and the “Tenants by property” section.
- Replace the recently added per-property cards with one simple, readable portfolio chart comparing this month’s expected rent, collected rent, and outstanding arrears by property.
- Keep the existing headline totals, quick actions, and recent transactions unchanged.

## Properties & Units
- Add a detailed property performance area to the existing Properties & Units page.
- Show each building’s occupancy, occupied/vacant units, active tenants, expected monthly rent, amount collected this month, arrears, and collection rate.
- Keep the existing property and unit management tables and controls below it.

## My Account
- Add a My Account page under Configuration in the sidebar.
- Move the landlord code there with a copy action.
- Show account identity, account approval state, subscription status, billing plan, price, trial/payment dates, and payment reference where available.
- Keep this page landlord-only so property managers do not see subscription or landlord-only account details.

## Technical details
- Reuse the existing property-performance data calculation so dashboard and detail figures stay consistent.
- Use the existing chart library and semantic design colors.
- Preserve all existing role-based menu visibility and data access rules.
- Verify the changes with the project type checker.
