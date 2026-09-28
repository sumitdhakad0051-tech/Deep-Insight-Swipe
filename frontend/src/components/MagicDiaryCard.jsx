import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Feather, BookmarkSimple } from "@phosphor-icons/react";

// Strip the raw markdown symbols so the "magic ink" reads as clean prose
// instead of literal asterisks and hashes. Handwritten diaries have no **.
function stripMagicMarkdown(s) {
  if (!s) return "";
  return s
    // Heading marks at line start: ## Heading, ### Heading
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    // Bold + italic wrappers **text** / *text* / __text__ / _text_
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, "$1$2")
    .replace(/(^|[^_])_(?!\s)([^_\n]+?)_(?!_)/g, "$1$2")
    // Inline code `x` -> x
    .replace(/`([^`\n]+)`/g, "$1")
    // Bullet dashes/asterisks at line start
    .replace(/^\s{0,3}[-*]\s+/gm, "· ");
}

/**
 * MagicDiaryCard
 *
 * Streams the AI response to a voice command onto an "insight card" the way
 * Tom Riddle's diary reveals text in Chamber of Secrets: the page is empty,
 * then letters fade in one-by-one in emerald ink with a blinking cursor.
 *
 * Props
 *  - open:        boolean
 *  - prompt:      the user's transcribed spoken text (rendered at the top)
 *  - fullText:    the growing string being streamed from the backend
 *  - streaming:   true while more deltas are still expected
 *  - error:       optional error string
 *  - onClose:     () => void
 *  - onSave:      optional () => void  (adds a "save this response" affordance)
 */
export default function MagicDiaryCard({
  open,
  prompt,
  fullText,
  streaming,
  error,
  onClose,
  onSave,
}) {
  // Number of characters currently revealed
  const [revealed, setRevealed] = useState(0);
  // Number of prompt chars revealed (typed on open)
  const [promptRevealed, setPromptRevealed] = useState(0);

  const lastTickRef = useRef(0);
  const bodyWrapRef = useRef(null);
  const userScrolledUpRef = useRef(false);
  const lastAutoScrollTopRef = useRef(0);
  const rafRef = useRef(null);

  // Reset counters whenever the diary is opened for a new prompt
  useEffect(() => {
    if (open) {
      setRevealed(0);
      setPromptRevealed(0);
      lastTickRef.current = 0;
      userScrolledUpRef.current = false;
      lastAutoScrollTopRef.current = 0;
    }
  }, [open, prompt]);

  // Track user manual scroll-up so we don't fight them.
  // Deterministic: only mark "user scrolled up" when scrollTop is *lower*
  // than our last programmatic scroll — programmatic scroll events (which
  // fire a frame after we set scrollTop) will match lastAutoScrollTopRef
  // and be ignored, so the auto-scroll cannot latch off by accident.
  useEffect(() => {
    const el = bodyWrapRef.current;
    if (!el) return;
    const onScroll = () => {
      const st = el.scrollTop;
      const last = lastAutoScrollTopRef.current;
      // Programmatic scroll (or noise around it) — ignore
      if (Math.abs(st - last) <= 2) return;
      // User scrolled UP relative to the last auto position
      if (st < last - 2) {
        userScrolledUpRef.current = true;
        return;
      }
      // User scrolled all the way back to bottom — resume follow
      const atBottom = el.scrollHeight - st - el.clientHeight < 12;
      if (atBottom) {
        userScrolledUpRef.current = false;
        lastAutoScrollTopRef.current = st;
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [open]);

  // Type the user's prompt at ~28ms/char once open
  useEffect(() => {
    if (!open || !prompt) return;
    if (promptRevealed >= prompt.length) return;
    const t = setTimeout(() => setPromptRevealed((n) => Math.min(prompt.length, n + 1)), 28);
    return () => clearTimeout(t);
  }, [open, prompt, promptRevealed]);

  // Reveal the streaming body chars using requestAnimationFrame so we can
  // deliver *chunks* per frame instead of one-char-per-timeout. This keeps
  // the letter-by-letter feel while ensuring we can drain thousands of
  // characters in ~1s once the SSE stream is complete.
  useEffect(() => {
    if (!open) return;
    if (promptRevealed < (prompt?.length || 0)) return; // wait for prompt

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const total = fullText?.length || 0;
      if (revealed >= total) {
        rafRef.current = null;
        return;
      }
      const behind = total - revealed;

      // Chunk size per frame. While streaming, keep a slow, readable
      // typewriter feel — but never fall further than ~1.5s behind. Once
      // streaming stops, drain everything in ~60 frames (~1s @ 60fps).
      let chunk;
      if (!streaming) {
        chunk = Math.max(6, Math.ceil(behind / 60));
      } else if (behind > 800)  chunk = 24;
      else if (behind > 400)    chunk = 12;
      else if (behind > 180)    chunk = 6;
      else if (behind > 80)     chunk = 3;
      else if (behind > 30)     chunk = 2;
      else                       chunk = 1;

      setRevealed((n) => Math.min(total, n + chunk));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [open, fullText, revealed, promptRevealed, prompt, streaming]);

  // Auto-scroll body wrap to bottom as new characters appear (unless the
  // user manually scrolled up).
  useEffect(() => {
    if (!open) return;
    const el = bodyWrapRef.current;
    if (!el) return;
    if (userScrolledUpRef.current) return;
    // Only bother when the body actually overflows
    if (el.scrollHeight - el.clientHeight > 8) {
      const target = el.scrollHeight;
      el.scrollTop = target;
      // Remember the position we set so the scroll handler can distinguish
      // programmatic from user scrolls.
      lastAutoScrollTopRef.current = el.scrollTop;
    }
  }, [open, revealed, promptRevealed]);

  // When the stream ends and we've drained the queue we consider it "done"
  const doneWriting =
    !streaming &&
    revealed >= (fullText?.length || 0) &&
    promptRevealed >= (prompt?.length || 0);

  const cursorVisible = !doneWriting || streaming;

  const shownPrompt = useMemo(
    () => (prompt || "").slice(0, promptRevealed),
    [prompt, promptRevealed]
  );
  const shownBody = useMemo(
    () => stripMagicMarkdown((fullText || "").slice(0, revealed)),
    [fullText, revealed]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="magic-diary-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#050506]/85 px-4 py-6 backdrop-blur-md"
          data-testid="magic-diary"
        >
          {/* Ambient emerald glow behind the card */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute h-[60vh] w-[60vh] rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(closest-side, rgba(64,175,120,0.22), rgba(64,175,120,0) 70%)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9 }}
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-[440px] overflow-hidden rounded-[22px] border border-white/10 bg-[#0E100F] p-6 pb-5 sm:p-7"
            style={{
              boxShadow:
                "0 40px 90px -30px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.02)",
            }}
          >
            {/* Parchment noise + subtle rules */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.85 0 0 0 0 0.98 0 0 0 0 0.75 0 0 0 0.9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-6 top-24 bottom-14 opacity-[0.04]"
              style={{
                background:
                  "repeating-linear-gradient(to bottom, transparent 0, transparent 30px, rgba(255,255,255,0.55) 30px, rgba(255,255,255,0.55) 31px)",
              }}
            />

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              data-testid="magic-diary-close"
              className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
              aria-label="Close diary"
            >
              <X size={14} weight="bold" />
            </button>

            {/* Diary title */}
            <div className="mb-4 flex items-center gap-2">
              <Feather size={14} weight="fill" className="text-emerald-300/80" />
              <span className="font-ui text-[10px] uppercase tracking-[0.28em] text-emerald-200/70">
                The Diary Replies
              </span>
            </div>

            {/* User prompt — "written into the page" */}
            <div className="relative mb-5">
              <p className="font-editorial text-[13px] italic leading-snug text-white/55">
                <span>&ldquo;</span>
                <span data-testid="magic-diary-prompt">{shownPrompt}</span>
                {promptRevealed < (prompt?.length || 0) && (
                  <span
                    aria-hidden
                    className="ml-[1px] inline-block h-[0.9em] w-[1.5px] translate-y-[2px] animate-pulse bg-emerald-200/80"
                  />
                )}
                <span>&rdquo;</span>
              </p>
            </div>

            {/* Ink stroke divider */}
            <svg
              aria-hidden
              viewBox="0 0 400 8"
              className="mb-5 h-2 w-full"
              preserveAspectRatio="none"
            >
              <motion.path
                d="M2 4 C 80 1, 160 7, 240 3 S 380 6, 398 4"
                stroke="rgba(160,220,190,0.55)"
                strokeWidth="1"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.9, delay: 0.15, ease: "easeOut" }}
              />
            </svg>

            {/* Body — streaming reveal */}
            <div
              ref={bodyWrapRef}
              className="relative min-h-[140px] max-h-[45vh] overflow-y-auto pr-1"
              data-testid="magic-diary-body-wrap"
            >
              {error ? (
                <p className="font-editorial text-[15px] leading-relaxed text-red-300/90">
                  {error}
                </p>
              ) : (
                <p
                  className="whitespace-pre-wrap font-editorial text-[16px] leading-relaxed text-emerald-50/95"
                  style={{ textShadow: "0 0 12px rgba(80, 200, 140, 0.18)" }}
                  data-testid="magic-diary-body"
                >
                  {shownBody}
                  {cursorVisible && (
                    <span
                      aria-hidden
                      className="ml-[2px] inline-block h-[1em] w-[2px] translate-y-[3px] animate-pulse bg-emerald-200/90"
                      style={{ boxShadow: "0 0 10px rgba(140, 240, 190, 0.7)" }}
                    />
                  )}
                </p>
              )}

              {/* When the reveal has caught the stream but stream still open, hint */}
              {!error && streaming && revealed >= (fullText?.length || 0) && promptRevealed >= (prompt?.length || 0) && (
                <p className="mt-3 font-ui text-[10px] uppercase tracking-[0.24em] text-emerald-200/40">
                  the page waits · listening
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="mt-5 flex items-center justify-between gap-3 pt-3">
              <span className="font-ui text-[10px] uppercase tracking-[0.22em] text-white/30">
                {error
                  ? "The ink refused"
                  : doneWriting
                  ? "The page is still"
                  : "Ink is flowing"}
              </span>

              <div className="flex items-center gap-2">
                {onSave && doneWriting && !error && (
                  <button
                    type="button"
                    onClick={onSave}
                    data-testid="magic-diary-save"
                    className="flex items-center gap-1.5 rounded-full border border-emerald-200/25 bg-emerald-200/[0.06] px-3 py-1.5 font-ui text-[10px] uppercase tracking-[0.18em] text-emerald-100/90 transition hover:bg-emerald-200/[0.12]"
                  >
                    <BookmarkSimple size={12} weight="fill" />
                    Keep
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  data-testid="magic-diary-done"
                  className="rounded-full bg-white/95 px-4 py-1.5 font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0C0C0D] transition hover:bg-white"
                >
                  {doneWriting || error ? "Close" : "Dismiss"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
