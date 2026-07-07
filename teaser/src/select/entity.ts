/**
 * The ONE entity matcher, shared across every layer that reasons about whether a
 * brand is named in text: the headline count + closed-head-to-head detection in
 * selectFindings, the winnability filter in ClaudeQuerySetGenerator, and the
 * rubric validator. Having a single primitive is deliberate — when the generator
 * and the selector used *different* boundary rules, a rival like "C#" or an
 * accented name matched in one place and not the other, letting a rigged query
 * slip through (adversarial finding #1).
 *
 * Case-insensitive, alias-aware, and bounded by UNICODE letter/number lookarounds
 * (not ASCII `\b`), so:
 *   - a name ending in punctuation ("C#", "C++", "Go!") still matches when
 *     surrounded by non-word chars, and
 *   - an accented/non-Latin name ("Nestlé") isn't split at the accent, while
 *   - a name embedded in a larger word ("Cal" in "Calendly", "Fort" in "Comfort")
 *     does NOT match.
 * The authoritative present/absent for printed FINDINGS still comes from the
 * platform judge; this matcher backs the count + the structural (head-to-head)
 * checks, and is deliberately conservative.
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildMatcher(name: string, aliases: string[] = []): (text: string) => boolean {
  const variants = [name, ...aliases].map((v) => v.trim()).filter(Boolean);
  if (variants.length === 0) return () => false;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(${variants.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`,
    "iu",
  );
  return (text: string) => pattern.test(text);
}
