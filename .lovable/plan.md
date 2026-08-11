# Polish the tenant header, sign-out and dashboard KPI tabs

Pure visual/presentation work. No data logic, queries or rules change.

## Tenant dashboard (`/tenant/dashboard`)

- **Tenant name speaks out**: replace the small "Tenant" label + name with a bold identity block — a gradient-filled, larger tracking-tight name (text-2xl/3xl), an avatar-style initial chip with a soft glow ring, and the property/unit line as a subtle pill row underneath. Lease status badge gets a soft glow matching its state.
- **Sign out becomes a real button**: outlined glass button with a red-tinted hover state, icon that slides/rotates on hover, subtle scale-down on press, and a brief spinner while signing out (visual only — same sign-out call).
- **Unit tile effects**: the property/unit line becomes a glass "unit chip" with an animated gradient border sheen, hover lift and a soft pulsing glow, matching the futuristic portal theme.
- Keep the existing layout, cards, green/red rent + balance tinting exactly as they are.

## Landlord dashboard (`/`)

Restyle the four KPI tabs (Total Units, Occupancy Rate, Collected, Arrears) so they read as premium stat tiles:

- Each card gets its own tinted glass surface with a soft coloured outer glow: Occupancy Rate glows bluish, Total Units a neutral/indigo tint, Collected a green tint, Arrears a red tint.
- Icon sits in a rounded glowing badge instead of plain text colour.
- Hover: gentle lift + brighter glow + cursor pointer (they are already clickable drill-downs — behaviour unchanged).
- Numbers get larger, tighter typography with a subtle gradient text fill.
- Cards fade/scale in on mount in a short stagger.

## Technical notes

- New keyframes/utilities (`kpi-glow`, `unit-sheen`, stagger fade) added to `src/styles.css`; all colours via existing semantic tokens plus a new bluish glow token so light/dark both work.
- Files touched: `src/styles.css`, `src/routes/_tenantauth/tenant.dashboard.tsx`, `src/routes/_authenticated/index.tsx`.
- No database, RLS or query changes.
