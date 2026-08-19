/** Editable lease template a landlord customises before tenants sign. */
export type LeaseTemplate = {
  landlordName: string;
  intro: string;
  clauses: string[];
  footer: string;
};

export const DEFAULT_LEASE_LANDLORD_NAME = "Rotich Management Systems";

export const DEFAULT_LEASE_INTRO =
  "This lease is entered into between {landlord} (the \"Landlord\") and {tenant} (the \"Tenant\") for the premises described below.";

export const DEFAULT_LEASE_CLAUSES = [
  "Rent is due monthly on the day of month above; late payment may attract a penalty.",
  "Utility charges (water, electricity where metered) are billed in addition to rent.",
  "The Tenant shall keep the premises in clean and habitable condition and report damage promptly.",
  "The Tenant may not sublet or transfer occupancy without written landlord consent.",
  "Either party may terminate this lease with 30 days' written notice.",
  "Structural, plumbing, electrical, and security repairs shall be reported through the tenant portal.",
  "The Landlord retains right of reasonable inspection with prior notice.",
];

export const DEFAULT_LEASE_FOOTER =
  "By signing below, the Tenant acknowledges reading, understanding, and agreeing to the terms above.";

type RawTemplate = {
  lease_landlord_name?: string | null;
  lease_intro?: string | null;
  lease_clauses?: string | null;
  lease_footer?: string | null;
} | null | undefined;

/** Turns the stored columns into a usable template, filling in defaults. */
export function resolveLeaseTemplate(raw: RawTemplate): LeaseTemplate {
  const clauses = (raw?.lease_clauses ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  return {
    landlordName: raw?.lease_landlord_name?.trim() || DEFAULT_LEASE_LANDLORD_NAME,
    intro: raw?.lease_intro?.trim() || DEFAULT_LEASE_INTRO,
    clauses: clauses.length ? clauses : DEFAULT_LEASE_CLAUSES,
    footer: raw?.lease_footer?.trim() || DEFAULT_LEASE_FOOTER,
  };
}

/** Replaces {landlord} / {tenant} / {unit} / {rent} placeholders. */
export function fillLeaseText(
  text: string,
  vars: { landlord?: string; tenant?: string; unit?: string; rent?: string; property?: string },
) {
  return text
    .replaceAll("{landlord}", vars.landlord ?? "the Landlord")
    .replaceAll("{tenant}", vars.tenant ?? "the Tenant")
    .replaceAll("{unit}", vars.unit ?? "—")
    .replaceAll("{rent}", vars.rent ?? "—")
    .replaceAll("{property}", vars.property ?? "—");
}
