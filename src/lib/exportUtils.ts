import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Convert an array of objects to CSV and trigger download.
 * Opens natively in Excel.
 */
export function exportToCSV(data: Record<string, any>[], filename: string) {
  if (!data.length) return;

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          let val = row[h] ?? "";
          if (typeof val === "object") val = JSON.stringify(val);
          // Escape commas and quotes
          val = String(val).replace(/"/g, '""');
          return `"${val}"`;
        })
        .join(",")
    ),
  ];

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}_${format(new Date(), "yyyy-MM-dd_HHmm")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export a table to PDF using jsPDF + autoTable, with title and optional metadata header.
 */
export function exportToPDF(
  data: Record<string, any>[],
  filename: string,
  options?: { title?: string; subtitle?: string; orientation?: "p" | "l" },
) {
  if (!data.length) return;
  const doc = new jsPDF({ orientation: options?.orientation ?? "l", unit: "pt", format: "a4" });
  const title = options?.title ?? filename;
  doc.setFontSize(14);
  doc.text(title, 40, 40);
  if (options?.subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(options.subtitle, 40, 56);
    doc.setTextColor(0);
  }
  const headers = Object.keys(data[0]);
  const body = data.map((row) =>
    headers.map((h) => {
      const v = row[h];
      if (v === null || v === undefined) return "";
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    }),
  );
  autoTable(doc, {
    startY: options?.subtitle ? 70 : 56,
    head: [headers],
    body,
    styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [234, 88, 12] },
    margin: { left: 40, right: 40 },
  });
  doc.save(`${filename}_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`);
}

