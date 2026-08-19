/** Tiny CSV helpers shared by the landlord reports and CEO analytics pages. */

export type CsvRow = Record<string, string | number | null | undefined>;

export function toCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

/** Triggers a browser download of `rows` as a CSV file. */
export function downloadCsv(filename: string, rows: CsvRow[]) {
  if (rows.length === 0) return;
  downloadText(filename, toCsv(rows), "text/csv;charset=utf-8;");
}

export function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8;") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
