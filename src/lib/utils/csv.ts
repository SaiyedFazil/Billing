import { formatReceiptAmount } from "./money";

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number;
};

/**
 * Escapes per RFC 4180: wrap in quotes when the value contains a comma, quote
 * or newline, and double any embedded quotes. Without this, an item named
 * `Burger, "large"` silently splits into extra columns in Excel.
 */
function escapeCell(value: string | number): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((column) => escapeCell(column.header)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCell(column.value(row))).join(","),
  );
  // Excel on Windows wants CRLF, and the BOM makes it read UTF-8 rather than
  // the system codepage — which matters for ₹ and non-ASCII item names.
  return `﻿${[header, ...body].join("\r\n")}\r\n`;
}

/**
 * Rupee amount with no symbol and no grouping — the form a spreadsheet parses
 * as a number. Takes the decimal string the database returned; never a number,
 * which would already have lost precision before the call.
 */
export function csvAmount(rupees: string): string {
  return formatReceiptAmount(rupees);
}
