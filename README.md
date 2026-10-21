# HomeBase Manager

Build a full-stack, single-user Rental Property Management Dashboard (a personal Bomahut clone) using React, Tailwind CSS, Shadcn UI components, and Supabase database integration. 



### APP LAYOUT & THEME

- **Layout:** Sidebar navigation with a top header displaying app title, quick summary chips, and a Light/Dark mode toggle.

- **Color Palette:** Clean modern aesthetic (Slate/Zinc background with Emerald Green primary action accents for financial metrics).

- **Navigation Tabs:**

  1. Dashboard

  2. Properties & Units

  3. Tenants

  4. Meter Readings & Utilities

  5. Billing & Invoices

  6. Payment Ledger & Receipts



---



### FEATURE BREAKDOWN & PAGES



1. **Dashboard (Overview)**

   - Top KPI Cards: Total Units, Occupancy Rate (%), Rent Collected This Month, Outstanding Arrears.

   - Quick Actions: "Log Payment", "Add Meter Reading", "Generate Monthly Bills".

   - Recent Transactions Table showing latest payments logged.



2. **Properties & Units Page**

   - Table displaying: Unit Number, Property/Building Name, Monthly Rent Amount, Occupancy Status (Vacant / Occupied Badge).

   - Form/Modal to add or edit a unit.



3. **Tenants Page**

   - List/Grid view of active tenants: Full Name, Phone Number, Assigned Unit, Rent Due Date, Security Deposit Paid, Balance/Arrears Status.

   - Modal to assign a new tenant to a vacant unit or mark a tenant as moved out.



4. **Meter Readings & Utilities Page**

   - Meter Reading Entry Table: Select Tenant/Unit, Previous Reading (auto-populated), Current Reading, Rate per Unit.

   - Auto-calculate: `Units Consumed = Current Reading - Previous Reading` and `Total Utility Bill = Units Consumed * Unit Rate`.



5. **Billing & Monthly Rent Roll Page**

   - Button to "Generate Bills for Selected Month".

   - Invoice breakdown per unit: Base Rent + Utility Charges = Total Invoice Amount.

   - Export/Preview button to render a printable/SMS-text invoice statement for any tenant.



6. **Payment Ledger & Receipts Page**

   - Form to log new payment: Select Tenant, Payment Date, Amount Paid, Payment Method (M-Pesa, Bank Transfer, Cash), Reference Number.

   - Automatic balance adjustment (`New Balance = Total Invoiced - Total Paid`).

   - Action button to render a formatted digital payment receipt with a "Print / Save PDF" option.



---



### DATABASE SCHEMA & SUPABASE INTEGRATION

Set up tables and sample mock data for local state / Supabase sync:

- `properties` (id, name, location)

- `units` (id, property_id, unit_number, rent_amount, status)

- `tenants` (id, unit_id, full_name, phone_number, deposit_paid, move_in_date)

- `utility_readings` (id, tenant_id, reading_date, previous_reading, current_reading, unit_rate, total_amount)

- `invoices` (id, tenant_id, month_year, base_rent, utility_amount, total_due, balance_remaining, status)

- `payments` (id, invoice_id, tenant_id, amount_paid, payment_method, reference_no, payment_date)



### BUSINESS LOGIC RULES

- Units marked as Occupied cannot be assigned to another tenant without moving out the existing one.

- Invoices automatically update status between "Unpaid", "Partially Paid", and "Paid" based on payments logged.

- Utility bill calculation must 

automatically prevent negative reading consumption errors.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://rotichrentalmanagement.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1484cfc1-3b68-45a7-a86a-a77d9d6bdfab).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
