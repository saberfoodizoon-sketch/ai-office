/** An error whose message is safe and meant to be shown to the user (Arabic). */
export class UserError extends Error {
  readonly user = true;
}

/** One line of plain text: no control characters or line breaks (blocks forged lines in AI prompts). */
export function oneLine(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Multi-line text with control characters (other than newlines) removed. */
export function multiLine(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, "")
    .trim()
    .slice(0, max);
}
