// Printable (Save-as-PDF) statements for a single unit or a whole property.
// Browser print dialog → "Save as PDF" gives a proper document, not a spreadsheet export.
import { toast } from "sonner";

export type StatementLine = {
  date: string;
  category?: "Rent" | "Services";
  description: string;
  charge?: number;
  paid?: number;
};

export type StatementSection = {
  /** e.g. "Unit A1 — John Doe" */
  heading: string;
  subheading?: string;
  lines: StatementLine[];
  billed: number;
  collected: number;
  outstanding: number;
  /** Total utility charges (water, electricity, garbage, metered utilities) billed in this section. */
  utilities: number;
  /** Utility charges still unpaid in this section. */
  utilitiesDue?: number;
  /** Base rent billed in this section. */
  rentBilled?: number;
};


const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const ksh = (n: number) =>
  `KES ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function buildStatementHtml(args: {
  title: string;
  propertyName: string;
  monthLabel: string;
  landlordName?: string;
  sections: StatementSection[];
}) {
  const totals = args.sections.reduce(
    (a, s) => ({
      billed: a.billed + s.billed,
      collected: a.collected + s.collected,
      out: a.out + s.outstanding,
      utilities: a.utilities + s.utilities,
      utilDue: a.utilDue + (s.utilitiesDue ?? 0),
      rent: a.rent + (s.rentBilled ?? 0),
    }),
    { billed: 0, collected: 0, out: 0, utilities: 0, utilDue: 0, rent: 0 },
  );


  const body = args.sections
    .map(
      (s) => `
      <section class="unit">
        <h2>${esc(s.heading)}</h2>
        ${s.subheading ? `<p class="sub">${esc(s.subheading)}</p>` : ""}
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="r">Charge</th><th class="r">Paid</th></tr></thead>
          <tbody>
            ${
              s.lines.length
                ? s.lines
                    .map(
                      (l) =>
                        `<tr><td>${esc(l.date)}</td><td>${l.category ? `<span class="type">${esc(l.category)}</span>` : "—"}</td><td>${esc(l.description)}</td><td class="r">${
                          l.charge ? ksh(l.charge) : "—"
                        }</td><td class="r">${l.paid ? ksh(l.paid) : "—"}</td></tr>`,
                    )
                    .join("")
                : `<tr><td colspan="5" class="c muted">No activity in this period.</td></tr>`
            }
          </tbody>
          <tfoot>
            <tr><th colspan="3">Totals</th><th class="r">${ksh(s.billed)}</th><th class="r">${ksh(s.collected)}</th></tr>
            <tr><td colspan="3" class="muted">of which rent</td><td class="r muted">${ksh(s.rentBilled ?? 0)}</td><td class="r muted">—</td></tr>
            <tr><td colspan="3" class="muted">of which utilities</td><td class="r muted">${ksh(s.utilities)}</td><td class="r muted">${ksh(Math.max(0, s.utilities - (s.utilitiesDue ?? 0)))}</td></tr>
            <tr><td colspan="3" class="muted">utilities still owed</td><td class="r muted">${ksh(s.utilitiesDue ?? 0)}</td><td class="r muted">—</td></tr>
          </tfoot>

        </table>
        <p class="bal ${s.outstanding > 0 ? "due" : "clear"}">
          ${s.outstanding > 0 ? `Outstanding balance: ${ksh(s.outstanding)}` : s.outstanding < 0 ? `Credit in hand: ${ksh(Math.abs(s.outstanding))}` : "Fully settled"}
        </p>
      </section>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(args.title)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;margin:0;padding:24px;font-size:12px}
    header{border-bottom:2px solid #0f766e;padding-bottom:10px;margin-bottom:16px}
    h1{font-size:18px;margin:0 0 4px}
    .meta{color:#555;font-size:11px}
    h2{font-size:13px;margin:0 0 2px}
    .sub{margin:0 0 8px;color:#555;font-size:11px}
    section.unit{page-break-inside:avoid;margin-bottom:18px;border:1px solid #e5e7eb;border-radius:8px;padding:12px}
    table{width:100%;border-collapse:collapse;margin-top:6px}
    th,td{border-bottom:1px solid #e5e7eb;padding:5px 6px;text-align:left;font-size:11px}
    thead th{background:#f1f5f9}
    .type{display:inline-block;border:1px solid #cbd5e1;border-radius:999px;padding:1px 6px;font-size:9px;font-weight:700;white-space:nowrap}
    .r{text-align:right}.c{text-align:center}.muted{color:#777}
    .bal{margin:8px 0 0;font-weight:700}
    .bal.due{color:#b91c1c}.bal.clear{color:#047857}
    .summary{margin-top:10px;border-top:2px solid #0f766e;padding-top:8px;font-weight:700;display:flex;gap:18px;flex-wrap:wrap}
    footer{margin-top:20px;color:#777;font-size:10px}
    @page{margin:14mm}
  </style></head><body>
  <header>
    <h1>${esc(args.title)}</h1>
    <div class="meta">${esc(args.propertyName)} · Statement period: ${esc(args.monthLabel)}${
      args.landlordName ? ` · Landlord: ${esc(args.landlordName)}` : ""
    }</div>
  </header>
  ${body}
  <div class="summary">
    <span>Total billed: ${ksh(totals.billed)}</span>
    <span>Total rent billed: ${ksh(totals.rent)}</span>
    <span>Total collected: ${ksh(totals.collected)}</span>
    <span>Total utilities billed: ${ksh(totals.utilities)}</span>
    <span>Utilities collected: ${ksh(Math.max(0, totals.utilities - totals.utilDue))}</span>
    <span>Utilities still owed: ${ksh(totals.utilDue)}</span>
    <span>Total outstanding: ${ksh(totals.out)}</span>
  </div>

  <footer>Generated ${esc(new Date().toLocaleString())} · Eden Point Real Estate</footer>
  </body></html>`;
}

/** Opens the print dialog (choose "Save as PDF") using a hidden iframe — works on mobile. */
export function printHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    toast.error("Printing is not supported on this device");
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      const w = window.open("", "_blank", "noopener,width=800,height=900");
      if (w) {
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
      } else {
        toast.error("Allow pop-ups to save the statement");
      }
    }
    setTimeout(() => frame.remove(), 60_000);
  };
  if (frame.contentWindow?.document.readyState === "complete") setTimeout(run, 150);
  else frame.onload = () => setTimeout(run, 150);
}
