import type { ZodError } from "zod";

/**
 * Flattens Zod issues into the `fields` map that `ActionResult` carries, keyed
 * by form field name so the UI can put each message under its input.
 */
export function fieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    fields[issue.path.join(".")] = issue.message;
  }
  return fields;
}
