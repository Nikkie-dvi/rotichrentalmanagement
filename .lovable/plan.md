# Guided registration and SMS alerts

## What will change
- Make the sign-in page open with a welcome step for Rotich Rental Management Systems instead of immediately showing a form.
- Let new users choose Tenant, Landlord, or Property Manager before registration starts.
- Keep a clear “I already have an account” path for existing users.
- Send each choice into its correct existing flow: tenant registration, landlord registration, or property-manager registration.
- Move Recent alerts out of Billing settings and into the SMS page as its own option immediately after Automatic texting.
- Preserve the existing alert status, recipient, date, message, and failure details.

## Technical details
- Rework the `/auth` page state into welcome, role selection, sign-in, and registration stages without changing account rules.
- Add a Recent alerts mode to `/messages`, reusing the existing notification history query and display.
- Remove the duplicate alert history query and panel from Billing settings.
- Verify the welcome and role choices on a phone-sized screen, then check the current build status.
