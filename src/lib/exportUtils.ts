import { format } from "date-fns";

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
