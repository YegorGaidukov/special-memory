/**
 * Human message for a failed microphone request, shown under the Narrate button.
 * iOS Safari never re-prompts once a site is denied, so NotAllowedError explains
 * where to re-enable it instead of just stating the failure.
 */
export function describeMicError(name: string, message: string): string {
  if (name === "NotAllowedError") {
    return (
      "Microphone blocked (NotAllowedError). Enable it via the aA button → " +
      "Website Settings → Microphone, or iOS Settings → Apps → Safari."
    );
  }
  if (name === "NotFoundError") return "No microphone found (NotFoundError).";
  return message ? `${name}: ${message}` : name;
}
