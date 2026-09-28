import { api } from "@/lib/api";

/**
 * Fire-and-forget behavior tracking. Failures are silent — this is telemetry, not core UX.
 */
export function trackBehavior({
  sessionId,
  insightId,
  topic,
  headline,
  event,
  dwellMs,
}) {
  if (!sessionId || !insightId || !event) return;
  api
    .post("/insights/behavior", {
      session_id: sessionId,
      insight_id: insightId,
      topic: topic || null,
      headline: headline || null,
      event,
      dwell_ms: dwellMs ?? null,
    })
    .catch(() => {});
}
