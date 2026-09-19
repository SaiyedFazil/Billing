/**
 * Hands a generated file to the browser as a download.
 *
 * Client-side only — creates an object URL, clicks a temporary link, then
 * revokes the URL so the blob is not retained.
 */
export function downloadTextFile(
  filename: string,
  contents: string,
  mimeType = "text/csv;charset=utf-8;",
): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
