/**
 * Convert an ordered list of interests into a valid topic string for the
 * /insights/directions endpoint. Backend `is_vague()` rejects topics with
 * `strip len < 4`, so a single short label (e.g. "AI") is padded.
 */
export function synthesizeTopicFromInterests(interests = []) {
  const list = (interests || []).map((s) => String(s).trim()).filter(Boolean);
  if (list.length === 0) return "";
  const joined = list.join(", ");
  if (list.length === 1 && joined.length < 4) {
    return `Deep dive on ${joined}`;
  }
  return joined;
}

/**
 * Heuristic: does an interest label look like a "News" storyline vs an
 * evergreen interest? News labels tend to be multi-word noun phrases with
 * proper nouns or verbs (e.g. "OpenAI o1 reasoning model release").
 * The InterestOnboarding also tags news picks explicitly via `newsSet` —
 * this helper is a fallback for downstream consumers.
 */
export function looksLikeNewsLabel(label = "") {
  const s = String(label).trim();
  if (!s) return false;
  const words = s.split(/\s+/);
  return words.length >= 3;
}
