// Printable (Save-as-PDF) statements for a single unit or a whole property.
// Browser print dialog → "Save as PDF" gives a proper document, not a spreadsheet export.
import { toast } from "sonner";

export type StatementLine = { date: string; description: string; charge?: number; paid?: number };

export type StatementSection = {
  /** e.g. "Unit A1 — John Doe" */
  heading: string;
  subheading?: string;
  lines: StatementLine[];
  billed: number;
  collected: number;
  outstanding: number;
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
    (a, s) => ({ billed: a.billed + s.billed, collected: a.collected + s.collected, out: a.out + s.outstanding }),
    { billed: 0, collected: 0, out: 0 },
  );

  const body = args.sections
    .map(
      (s) => `
      <section class="unit">
        <h2>${esc(s.heading)}</h2>
        ${s.subheading ? `<p class="sub">${esc(s.subheading)}</p>` : ""}
        <table>
          <thead><tr><th>Date</th><th>Description</th><th class="r">Charge</th><th class="r">Paid</th></tr></thead>
          <tbody>
            ${
              s.lines.length
                ? s.lines
                    .map(
                      (l) =>
                        `<tr><td>${esc(l.date)}</td><td>${esc(l.description)}</td><td class="r">${
                          l.charge ? ksh(l.charge) : "—"
                        }</td><td class="r">${l.paid ? ksh(l.paid) : "—"}</td></tr>`,
                    )
                    .join("")
                : `<tr><td colspan="4" class="c muted">No activity in this period.</td></tr>`
            }
          </tbody>
          <tfoot>
            <tr><th colspan="2">Totals</th><th class="r">${ksh(s.billed)}</th><th class="r">${ksh(s.collected)}</th></tr>
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
    <span>Total collected: ${ksh(totals.collected)}</span>
    <span>Total outstanding: ${ksh(totals.out)}</span>
  </div>
  <footer>Generated ${esc(new Date().toLocaleString())} · Rotich Management Systems</footer>
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
