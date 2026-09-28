import React, { useEffect, useRef, useState, useMemo } from "react";
import ReactDOM from "react-dom";
import { motion, useMotionValue, animate } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Link as LinkIcon,
  Flame,
  ArrowUp,
  ArrowsClockwise,
  BookmarkSimple,
  ChatCircleDots,
  SpeakerHigh,
  SpeakerSlash,
  Microphone,
} from "@phosphor-icons/react";
import { streamHotTopics, saveInsight, fetchTTS } from "@/lib/api";
import { toast } from "sonner";
import VoiceRecorder from "@/components/VoiceRecorder";

/**
 * Hot Now — Landing-page pulse feed.
 *
 * A fixed-height vertical swipe stack shown ABOVE the interest picker.
 * Visually identical to the feed cards so the swipe affordance transfers.
 * Double-tap any card → /directions with the card's `topic` prefilled.
 *
 * Design principles:
 *   Symmetry     — every card shares the exact same footprint / layout.
 *   Repetition   — the same 5 card slots are recycled as you swipe.
 *   Recursion    — hot card → direction → 12-card deep feed (same swipe UX).
 *   Affordance   — the hint pill "Swipe up · Double-tap deeper" is visible
 *                  on the first card so a 5-year-old can drive it.
 */

const ADVANCE_DIST_FRAC = 0.14;
const ADVANCE_VELOCITY = 380;
const SNAP_STIFFNESS = 320;
const SNAP_DAMPING = 34;
const DOUBLE_TAP_MS = 320;

export default function HotFeed() {
  const navigate = useNavigate();
  const [rawCards, setRawCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expectedTotal, setExpectedTotal] = useState(12);
  const [activeIdx, setActiveIdx] = useState(0);
  const [hasSwiped, setHasSwiped] = useState(false);
  const [containerH, setContainerH] = useState(640);
  const [genToken, setGenToken] = useState(0); // bump to trigger a regenerate
  const containerRef = useRef(null);
  const y = useMotionValue(0);
  const lastTapRef = useRef({ time: 0, timeoutId: null });

  const isRegenerating = loading && genToken > 0 && rawCards.length === 0;

  // Canonical order = blueprint_index (server-defined) so Politics/Pradhan
  // stays position 0 regardless of SSE arrival order.
  const cards = useMemo(
    () =>
      [...rawCards].sort(
        (a, b) => (a.blueprint_index ?? 0) - (b.blueprint_index ?? 0),
      ),
    [rawCards],
  );

  // Progressively load hot cards via SSE — first card unblocks the UI.
  // Re-runs whenever `genToken` changes (Regenerate button).
  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        // First run uses cache; regenerates force fresh
        const fresh = genToken > 0;
        for await (const ev of streamHotTopics({ signal: ac.signal, fresh })) {
          if (cancelled) return;
          if (ev.phase === "start") {
            setExpectedTotal(ev.total || 12);
          } else if (ev.phase === "card" && ev.card) {
            setRawCards((cur) => [...cur, ev.card]);
            setLoading(false);
          } else if (ev.phase === "error") {
            setError(true);
            setLoading(false);
          } else if (ev.phase === "done") {
            setLoading(false);
          }
        }
      } catch (e) {
        if (!cancelled && e?.name !== "AbortError") {
          setError(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      try { ac.abort(); } catch { /* noop */ }
    };
  }, [genToken]);

  const handleRegenerate = (singleIdx, newCard) => {
    // Single-card swap when args provided (from ActionBar per-card regen)
    if (typeof singleIdx === "number" && newCard) {
      setRawCards((prev) => {
        const copy = [...prev];
        if (singleIdx >= 0 && singleIdx < copy.length) copy[singleIdx] = newCard;
        return copy;
      });
      return;
    }
    // Whole-deck regenerate (from header Regenerate button)
    setRawCards([]);
    setError(false);
    setLoading(true);
    setActiveIdx(0);
    setHasSwiped(false);
    y.set(0);
    setGenToken((t) => t + 1);
  };

  // Measure container height for framer drag math — re-runs when the
  // real container mounts (after the first card arrives, replacing the
  // loading skeleton) and on viewport resize.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0) setContainerH(rect.height);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [cards.length]);

  // Snap y to activeIdx whenever active changes
  useEffect(() => {
    const target = -activeIdx * containerH;
    animate(y, target, { type: "spring", stiffness: SNAP_STIFFNESS, damping: SNAP_DAMPING });
  }, [activeIdx, containerH, y]);

  const advance = (delta) => {
    setHasSwiped(true);
    setActiveIdx((cur) => Math.max(0, Math.min((cards.length || 1) - 1, cur + delta)));
  };

  const goDeep = (card) => {
    if (!card) return;
    navigate("/directions", {
      state: { topic: card.topic || card.headline, hot_meta: { rail: card.rail, category: card.category } },
    });
  };

  const handleDoubleTap = (card) => {
    if (lastTapRef.current.timeoutId) clearTimeout(lastTapRef.current.timeoutId);
    const now = Date.now();
    const dt = now - lastTapRef.current.time;
    lastTapRef.current.time = now;
    if (dt < DOUBLE_TAP_MS) {
      lastTapRef.current.time = 0;
      goDeep(card);
    }
  };

  if (loading && cards.length === 0) {
    return (
      <section className="mx-auto w-full max-w-xl px-5 sm:px-0" data-testid="hot-feed-loading">
        <HotHeader onRegenerate={handleRegenerate} regenerating={isRegenerating} disableRegen />
        <div className="relative mx-auto h-[calc(100dvh-160px)] max-h-[820px] min-h-[500px] w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-white/[0.03] via-transparent to-white/[0.03]" />
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-8 text-center">
            <div className="mx-auto mb-4 h-3 w-24 animate-pulse rounded-full bg-white/10" />
            <div className="mx-auto mb-3 h-8 w-3/4 animate-pulse rounded-full bg-white/10" />
            <div className="mx-auto h-3 w-5/6 animate-pulse rounded-full bg-white/10" />
            {isRegenerating && (
              <p className="mt-6 font-ui text-[10px] uppercase tracking-[0.28em] text-white/40">
                Fetching a fresh pulse…
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (error || !cards.length) {
    return (
      <section className="mx-auto w-full max-w-xl px-5 sm:px-0" data-testid="hot-feed-empty">
        <HotHeader onRegenerate={handleRegenerate} regenerating={isRegenerating} />
        <div className="mx-auto flex h-[280px] w-full max-w-md items-center justify-center rounded-3xl border border-white/10 bg-white/[0.02] px-8 text-center">
          <p className="font-editorial text-sm italic text-white/50">
            The Pulse is warming up. Refresh in a minute — or start with your own spark below.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-xl px-5 sm:px-0" data-testid="hot-feed">
      <HotHeader
        activeIdx={activeIdx}
        total={cards.length}
        expected={expectedTotal}
        streaming={loading}
        onRegenerate={handleRegenerate}
        regenerating={isRegenerating}
      />

      <div
        ref={containerRef}
        className="relative mx-auto h-[calc(100dvh-160px)] max-h-[820px] min-h-[500px] w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#0F0F11] shadow-[0_10px_60px_rgba(0,0,0,0.5)]"
        style={{ touchAction: "pan-y" }}
      >
        <motion.div
          className="absolute inset-x-0 top-0"
          style={{ y, height: cards.length * containerH }}
          drag="y"
          dragConstraints={{ top: -(cards.length - 1) * containerH, bottom: 0 }}
          dragElastic={0.12}
          onDragEnd={(_, info) => {
            const offset = info.offset.y;
            const velocity = info.velocity.y;
            const threshold = containerH * ADVANCE_DIST_FRAC;
            if (offset < -threshold || velocity < -ADVANCE_VELOCITY) {
              advance(1);
            } else if (offset > threshold || velocity > ADVANCE_VELOCITY) {
              advance(-1);
            } else {
              animate(y, -activeIdx * containerH, { type: "spring", stiffness: SNAP_STIFFNESS, damping: SNAP_DAMPING });
            }
          }}
        >
          {cards.map((c, i) => {
            // Only render active +/- 1 for perf
            if (Math.abs(i - activeIdx) > 1) {
              return (
                <div
                  key={c.id}
                  style={{ position: "absolute", top: i * containerH, left: 0, right: 0, height: containerH }}
                />
              );
            }
            return (
              <div
                key={c.id}
                className="overflow-hidden"
                style={{ position: "absolute", top: i * containerH, left: 0, right: 0, height: containerH }}
              >
                <HotCard
                  card={c}
                  idx={i}
                  total={cards.length}
                  showHint={i === activeIdx && !hasSwiped && i === 0}
                  onTap={() => handleDoubleTap(c)}
                  onGoDeep={() => goDeep(c)}
                  onRegenerate={handleRegenerate}
                />
              </div>
            );
          })}
        </motion.div>

        {/* Swipe-up hint on very first card, floats over the card */}
        {!hasSwiped && cards.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex flex-col items-center gap-1">
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-white/25 text-white/60"
            >
              <ArrowUp size={11} />
            </motion.div>
            <p className="font-ui text-[9px] uppercase tracking-[0.28em] text-white/45">
              Swipe up
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function HotHeader({
  activeIdx = 0,
  total = 0,
  expected = 12,
  streaming = false,
  onRegenerate,
  regenerating = false,
  disableRegen = false,
}) {
  const canRegen = typeof onRegenerate === "function" && !disableRegen && !regenerating;
  return (
    <div className="mx-auto mb-4 flex w-full max-w-md items-center justify-between">
      <div className="flex items-center gap-2">
        <motion.span
          animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white/90"
        >
          <Flame size={12} weight="fill" />
        </motion.span>
        <div>
          <p className="font-ui text-[10px] uppercase tracking-[0.32em] text-white/60">
            Hot Now · India
          </p>
          <p className="font-ui text-[9px] uppercase tracking-[0.24em] text-white/30">
            Double-tap any card to go deeper
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {total > 0 && streaming && total < expected && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-ui text-[9px] uppercase tracking-[0.22em] text-white/55"
            data-testid="hot-streaming"
          >
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="h-1 w-1 rounded-full bg-white/80"
            />
            Loading {total}/{expected}
          </span>
        )}
        {total > 0 && (
          <span
            className="font-ui text-[10px] uppercase tracking-[0.28em] text-white/45"
            data-testid="hot-progress"
          >
            {String(Math.min(activeIdx + 1, total)).padStart(2, "0")}
            <span className="mx-1 text-white/20">/</span>
            {String(total).padStart(2, "0")}
          </span>
        )}
        {typeof onRegenerate === "function" && (
          <button
            type="button"
            onClick={canRegen ? onRegenerate : undefined}
            disabled={!canRegen}
            data-testid="hot-regenerate-btn"
            aria-label="Regenerate Hot Now cards"
            title="Regenerate — fetch a fresh pulse"
            className={`inline-flex items-center gap-1 rounded-full border border-white/12 px-2 py-1 font-ui text-[9px] uppercase tracking-[0.22em] transition-all no-tap-zoom ${
              canRegen
                ? "bg-white/[0.04] text-white/80 hover:border-white/25 hover:bg-white/[0.08] hover:text-white active:scale-95"
                : "bg-white/[0.02] text-white/35 cursor-wait"
            }`}
          >
            <motion.span
              animate={regenerating ? { rotate: 360 } : { rotate: 0 }}
              transition={
                regenerating
                  ? { repeat: Infinity, duration: 1.1, ease: "linear" }
                  : { duration: 0.2 }
              }
              className="flex items-center justify-center"
            >
              <ArrowsClockwise size={11} weight="bold" />
            </motion.span>
            <span data-testid="hot-regenerate-label">
              {regenerating ? "Refreshing" : "Regenerate"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function HotCard({ card, idx, total, showHint, onTap, onGoDeep, onRegenerate }) {
  const [showBackStory, setShowBackStory] = React.useState(false);
  const [seededQuestion, setSeededQuestion] = React.useState("");
  const [showFull, setShowFull] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const [micBusy, setMicBusy] = React.useState(false);
  const [voiceOpen, setVoiceOpen] = React.useState(false);
  const [voiceSteering, setVoiceSteering] = React.useState(false);
  const audioRef = React.useRef(null);
  const clickTimerRef = React.useRef(null);

  const handleCardClick = (e) => {
    // If double-tap is happening, onDoubleClick fires separately — cancel single-tap open
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      setShowFull(true);
    }, 260);
  };

  const handleCardDouble = () => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onGoDeep && onGoDeep();
  };

  const handleSave = async (e) => {
    e.stopPropagation();
    try {
      await saveInsight({
        topic: card.topic || "",
        headline: card.headline || "",
        text: card.text || "",
        source_url: card.source_url || null,
        source_title: card.source_title || null,
      });
      setSaved(true);
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
  };

  const handleListen = async (e) => {
    e.stopPropagation();
    if (listening && audioRef.current) {
      audioRef.current.pause();
      if (audioRef.current._url) URL.revokeObjectURL(audioRef.current._url);
      audioRef.current = null;
      setListening(false);
      return;
    }
    try {
      setListening(true);
      const spoken = `${card.headline}. ${card.text}`;
      const blob = await fetchTTS(spoken, "sage");
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio._url = url;
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setListening(false);
        audioRef.current = null;
      };
      try {
        await audio.play();
      } catch {
        URL.revokeObjectURL(url);
        setListening(false);
        audioRef.current = null;
        toast.error("Autoplay blocked");
      }
    } catch { setListening(false); toast.error("Listen failed"); }
  };

  const handleMic = (e) => {
    e.stopPropagation();
    setVoiceOpen(true);
  };

  const onVoiceResult = async (transcript) => {
    setVoiceOpen(false);
    const q = (transcript || "").trim();
    if (!q) return;
    // If it sounds like a steer command, regenerate; else seed backstory chat
    setVoiceSteering(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/insights/hot/regenerate-single`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: card.topic || "",
          headline: card.headline || "",
          text: card.text || "",
          source_title: card.source_title || "",
          steer: q,
        }),
      });
      const data = await res.json();
      if (data && data.card) {
        onRegenerate && onRegenerate(idx, data.card);
        toast.success("Reshaped");
      } else {
        setSeededQuestion(q);
        setShowBackStory(true);
      }
    } catch {
      setSeededQuestion(q);
      setShowBackStory(true);
    }
    setVoiceSteering(false);
  };

  const handleRegen = async (e) => {
    e.stopPropagation();
    if (voiceSteering) return;
    setVoiceSteering(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/insights/hot/regenerate-single`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: card.topic || "",
          headline: card.headline || "",
          text: card.text || "",
          source_title: card.source_title || "",
          steer: "",
        }),
      });
      const data = await res.json();
      if (data && data.card) {
        onRegenerate && onRegenerate(idx, data.card);
      } else toast.error("Couldn't regenerate");
    } catch { toast.error("Regen failed"); }
    setVoiceSteering(false);
  };

  return (
    <article
      data-testid={`hot-card-${idx}`}
      onClick={handleCardClick}
      onDoubleClick={handleCardDouble}
      className="relative flex h-full w-full flex-col px-6 pb-6 pt-5 sm:px-8"
      style={{ touchAction: "pan-y" }}
    >
      {/* Position counter only — no category/persona pills */}
      <div className="flex items-center justify-end flex-shrink-0">
        <span className="font-ui text-[9px] uppercase tracking-[0.28em] text-white/35">
          {String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>

      {/* Topic subtitle — so reader always knows the underlying story */}
      {card.topic && (
        <div
          data-testid={`hot-topic-${idx}`}
          className="mt-4 font-ui text-[11px] uppercase tracking-[0.22em] text-white/45 line-clamp-1"
        >
          {card.topic}
        </div>
      )}

      {/* Headline */}
      <h2
        data-testid={`hot-headline-${idx}`}
        className="mt-2 font-editorial text-[26px] leading-[1.14] text-white sm:text-[28px] flex-shrink-0"
      >
        {card.headline}
      </h2>

      {/* Body — clipped inside its own flex slot */}
      <div
        className="mt-5 min-h-0 flex-1 overflow-hidden"
        style={{
          WebkitMaskImage:
            "linear-gradient(to bottom, black calc(100% - 28px), transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, black calc(100% - 28px), transparent 100%)",
        }}
      >
        <p
          data-testid={`hot-text-${idx}`}
          className="font-editorial text-[15px] leading-[1.55] text-white/85 sm:text-[16px]"
        >
          {card.text}
        </p>
      </div>

      {/* Bottom row: source + Back Story pill on right. Actions in ActionBar below. */}
      <div className="mt-4 flex items-center justify-between gap-3 flex-shrink-0 pb-14">
        {card.source_url ? (
          <a
            href={card.source_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            data-testid={`hot-source-${idx}`}
            className="inline-flex w-fit max-w-[55%] items-center gap-2 truncate rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 font-ui text-[11px] text-white/60 transition-colors hover:border-white/25 hover:text-white/90"
          >
            <LinkIcon size={12} weight="regular" />
            <span className="truncate">
              {card.source_title
                ? card.source_title.slice(0, 32) + (card.source_title.length > 32 ? "…" : "")
                : "Source"}
            </span>
          </a>
        ) : <span />}
        <button
          data-testid={`hot-backstory-btn-${idx}`}
          onClick={(e) => { e.stopPropagation(); setSeededQuestion(""); setShowBackStory(true); }}
          className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-1.5 font-ui text-[11px] font-medium text-fuchsia-200/90 transition hover:bg-fuchsia-500/20 hover:border-fuchsia-400/50 flex-shrink-0"
        >
          <span className="h-1 w-1 rounded-full bg-fuchsia-300" />
          Back Story
        </button>
      </div>

      {/* Bottom ActionBar — same layout as Feed (Save · Ask · Listen · New · Mic) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-3 sm:bottom-6">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/10 bg-[#121214]/95 px-1 py-1 backdrop-blur-xl shadow-[0_-2px_20px_rgba(0,0,0,0.35)]">
          <HotIconBtn testId={`hot-save-btn-${idx}`} label={saved ? "Saved" : "Save"} onClick={handleSave} active={saved}>
            <BookmarkSimple size={17} weight={saved ? "fill" : "regular"} />
          </HotIconBtn>
          <HotIconBtn testId={`hot-ask-btn-${idx}`} label="Ask" onClick={(e) => { e.stopPropagation(); setSeededQuestion(""); setShowBackStory(true); }}>
            <ChatCircleDots size={17} weight="regular" />
          </HotIconBtn>
          <HotIconBtn testId={`hot-listen-btn-${idx}`} label={listening ? "Stop" : "Listen"} onClick={handleListen} active={listening}>
            {listening ? <SpeakerSlash size={17} weight="fill" /> : <SpeakerHigh size={17} weight="regular" />}
          </HotIconBtn>
          <HotIconBtn testId={`hot-regen-btn-${idx}`} label="New" onClick={handleRegen} disabled={voiceSteering}>
            {voiceSteering ? (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />
            ) : <ArrowsClockwise size={17} weight="regular" />}
          </HotIconBtn>
          <HotIconBtn testId={`hot-mic-btn-${idx}`} label="Ask by voice" onClick={handleMic} disabled={voiceSteering}>
            <Microphone size={17} weight="regular" />
          </HotIconBtn>
        </div>
      </div>

      {/* VoiceRecorder — same one used by Feed */}
      <VoiceRecorder open={voiceOpen} onClose={() => setVoiceOpen(false)} onResult={onVoiceResult} />

      {/* Fullscreen expanded card (single-tap) — scrollable, mobile-first */}
      <ExpandedCardSheet card={card} idx={idx} open={showFull} onClose={() => setShowFull(false)} />

      {/* Back Story sheet — rendered via portal to escape card DOM */}
      <BackStorySheet
        card={card}
        idx={idx}
        open={showBackStory}
        onClose={() => { setShowBackStory(false); setSeededQuestion(""); }}
        seededQuestion={seededQuestion}
      />

      {/* First-card affordance overlay */}
      {showHint && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-white/15 bg-[#121214]/95 px-3 py-1 font-ui text-[9px] uppercase tracking-[0.24em] text-white/70 backdrop-blur-md"
        >
          Swipe · Double-tap deeper
        </motion.div>
      )}
    </article>
  );
}


function HotIconBtn({ children, label, onClick, testId, active, disabled }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      aria-label={label}
      disabled={disabled}
      style={{ touchAction: "manipulation" }}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
        active ? "bg-white text-[#0C0C0D]" : "text-white/85 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}


// ── Fullscreen expanded card (single-tap) — scrollable ──
function ExpandedCardSheet({ card, idx, open, onClose }) {
  if (!open || typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div
      data-testid={`hot-expanded-${idx}`}
      className="fixed inset-0 z-[95] bg-[#0C0C0D] overflow-y-auto"
      onClick={onClose}
    >
      <div className="min-h-full flex flex-col px-6 pt-6 pb-24 sm:px-10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <span className="font-ui text-[10px] uppercase tracking-[0.28em] text-white/40">
            {String(idx + 1).padStart(2, "0")}
          </span>
          <button
            onClick={onClose}
            data-testid={`hot-expanded-close-${idx}`}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-ui text-[11px] text-white/60 hover:bg-white/[0.08]"
          >
            Close
          </button>
        </div>
        {card.topic && (
          <div className="mb-3 font-ui text-[11px] uppercase tracking-[0.22em] text-white/45">
            {card.topic}
          </div>
        )}
        <h2 className="mb-6 font-editorial text-[28px] leading-[1.16] text-white sm:text-[32px]">
          {card.headline}
        </h2>
        <p className="font-editorial text-[16px] leading-[1.65] text-white/90 whitespace-pre-wrap sm:text-[17px]">
          {card.text}
        </p>
        {card.source_url && (
          <a
            href={card.source_url}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 font-ui text-[12px] text-white/60 hover:border-white/25 hover:text-white/90 w-fit"
          >
            <LinkIcon size={13} />
            <span>{card.source_title || "Read the source"}</span>
          </a>
        )}
      </div>
    </div>,
    document.body
  );
}


// ── BackStorySheet: portal-based modal with LLM-generated backstory + chat ──
function BackStorySheet({ card, idx, open, onClose, seededQuestion }) {
  const [backstory, setBackstory] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [chatMsgs, setChatMsgs] = React.useState([]); // [{role, text}]
  const [chatInput, setChatInput] = React.useState("");
  const [chatStreaming, setChatStreaming] = React.useState(false);
  const abortRef = React.useRef(null);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    setBackstory("");
    setChatMsgs([]);
    setChatInput(seededQuestion || "");
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/insights/hot/backstory/stream`;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: card.topic || "",
        headline: card.headline || "",
        text: card.text || "",
        source_title: card.source_title || "",
        source_url: card.source_url || "",
      }),
      signal: ctrl.signal,
    }).then(async (r) => {
      if (!r.ok) throw new Error(`http ${r.status}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const p of parts) {
          if (!p.startsWith("data:")) continue;
          try {
            const j = JSON.parse(p.slice(5).trim());
            if (j.phase === "chunk" && j.text) {
              setBackstory((prev) => prev + j.text);
            } else if (j.phase === "done") {
              setLoading(false);
            } else if (j.phase === "error") {
              setBackstory("Couldn't load the back story — try again in a moment.");
              setLoading(false);
            }
          } catch {}
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => ctrl.abort();
  }, [open, card?.id]);

  const askFollowup = async () => {
    const q = chatInput.trim();
    if (!q || chatStreaming) return;
    setChatInput("");
    setChatMsgs((m) => [...m, { role: "user", text: q }, { role: "assistant", text: "" }]);
    setChatStreaming(true);
    try {
      const r = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/insights/hot/backstory/chat/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: card.topic || "",
            headline: card.headline || "",
            text: card.text || "",
            backstory,
            question: q,
          }),
        }
      );
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const p of parts) {
          if (!p.startsWith("data:")) continue;
          try {
            const j = JSON.parse(p.slice(5).trim());
            if (j.phase === "chunk" && j.text) {
              setChatMsgs((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", text: copy[copy.length - 1].text + j.text };
                return copy;
              });
              setTimeout(() => {
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }, 30);
            }
          } catch {}
        }
      }
    } catch {}
    setChatStreaming(false);
  };

  if (!open || typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div
      data-testid={`hot-backstory-modal-${idx}`}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 backdrop-blur-md sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0E0E10] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between border-b border-white/8 bg-[#0E0E10] px-6 py-4">
          <span className="font-ui text-[10px] uppercase tracking-[0.28em] text-fuchsia-300/70">
            Back Story
          </span>
          <button
            onClick={onClose}
            data-testid={`hot-backstory-close-${idx}`}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-ui text-[11px] text-white/60 hover:bg-white/[0.08]"
          >
            Close
          </button>
        </div>

        {/* Scrollable body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
          {card.topic && (
            <div className="mb-2 font-ui text-[11px] uppercase tracking-[0.22em] text-white/50">
              {card.topic}
            </div>
          )}
          <h3 className="mb-4 font-editorial text-[20px] leading-[1.2] text-white">
            {card.headline}
          </h3>

          {/* Rendered backstory */}
          <div
            data-testid={`hot-backstory-body-${idx}`}
            className="font-editorial text-[14px] leading-[1.65] text-white/85 whitespace-pre-wrap"
          >
            {backstory || (loading ? "" : "No back story available yet.")}
            {loading && (
              <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-fuchsia-300/60 align-middle" />
            )}
          </div>

          {/* Chat thread */}
          {chatMsgs.length > 0 && (
            <div className="mt-6 space-y-3 border-t border-white/8 pt-4">
              {chatMsgs.map((m, i) => (
                <div
                  key={i}
                  className={m.role === "user"
                    ? "self-end rounded-2xl rounded-tr-md bg-fuchsia-500/15 border border-fuchsia-400/25 px-3.5 py-2 font-ui text-[13px] text-fuchsia-100 ml-auto max-w-[85%] w-fit"
                    : "rounded-2xl rounded-tl-md bg-white/[0.04] border border-white/8 px-3.5 py-2 font-editorial text-[13.5px] leading-[1.55] text-white/85 max-w-[92%]"
                  }
                >
                  {m.text || (chatStreaming && i === chatMsgs.length - 1 ? "…" : "")}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat input */}
        <div className="border-t border-white/8 bg-[#0E0E10] px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") askFollowup(); }}
              placeholder="Ask anything about this insight…"
              data-testid={`hot-backstory-input-${idx}`}
              className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 font-ui text-[13px] text-white placeholder:text-white/35 outline-none focus:border-fuchsia-400/40"
            />
            <button
              onClick={askFollowup}
              disabled={!chatInput.trim() || chatStreaming}
              data-testid={`hot-backstory-send-${idx}`}
              className="shrink-0 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/15 px-4 py-2 font-ui text-[12px] font-medium text-fuchsia-200 transition hover:bg-fuchsia-500/25 disabled:opacity-40"
            >
              Ask
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
