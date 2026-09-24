# Unified Portfolio Performance

## Goal
Create one professional Portfolio Performance workspace where landlords can review performance and produce reports from the same selected month and shared property data.

## Changes
- Make the dashboard’s **Portfolio performance → Details** action open `/performance` instead of Properties & Units.
- Rework `/performance` into the single performance and reporting workspace with clear **Overview**, **Unit performance**, **Payment habits**, **Tenant issues**, and **Reports & downloads** areas.
- Move the monthly report controls, totals, CSV downloads, and printable property/unit statements into that workspace so reporting uses the same month and portfolio context.
- Remove the separate Reports tab from the finance switcher and redirect `/reports` to `/performance`, preserving existing links and bookmarks.
- Update sidebar wording and route matching so **Portfolio Performance** is a landlord-facing destination and Billing remains focused on invoices.
- Keep detailed per-building operational cards under Properties & Units, while portfolio-level analysis and exports live under Portfolio Performance.

## Technical details
- Extract the existing report data/loading and report actions into a reusable portfolio report section rather than duplicating calculations.
- Preserve all existing exports, print statements, permissions, and owner-scoped data access.
- Keep route-specific metadata and verify desktop and mobile layouts, navigation, and the production build signal.
