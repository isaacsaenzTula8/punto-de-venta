function escapeCsv(value: unknown) {
  const raw = String(value ?? "");
  if (raw.includes('"') || raw.includes(",") || raw.includes("\n")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function downloadCsv(filename: string, rows: Array<Array<unknown>>) {
  const content = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function printHtmlAsPdf(title: string, htmlBody: string) {
  const popup = window.open("", "_blank", "width=980,height=720");
  if (!popup) return false;

  popup.document.open();
  popup.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
          h1 { margin: 0 0 12px; font-size: 22px; }
          h2 { margin: 18px 0 8px; font-size: 16px; }
          table { border-collapse: collapse; width: 100%; margin-top: 8px; }
          th, td { border: 1px solid #d1d5db; padding: 6px 8px; font-size: 12px; text-align: left; }
          th { background: #f3f4f6; }
          .meta { margin: 0 0 12px; font-size: 12px; color: #4b5563; }
        </style>
      </head>
      <body>
        ${htmlBody}
      </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.print();
  return true;
}

export function parseCsvText(input: string): string[][] {
  const firstLine = String(input || "")
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0) || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char === "\r") {
      continue;
    }
    cell += char;
  }

  row.push(cell.trim());
  if (row.length > 1 || row[0]) {
    rows.push(row);
  }
  return rows;
}
