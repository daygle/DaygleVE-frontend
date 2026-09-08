/**
 * Helpers for the free-form organizational tags on VMs and containers.
 * The backend validates and normalizes tags; these just move between the
 * comma/space-separated text the user types and the string array the API uses.
 */

/** Parse a comma/space-separated string into a de-duplicated tag array. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(/[\s,]+/)) {
    const tag = raw.trim();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/** Render a tag array back into a comma-separated string for editing. */
export function formatTags(tags: string[] | undefined): string {
  return (tags ?? []).join(", ");
}
