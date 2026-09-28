import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowUp,
  ArrowDown,
  BookmarkSimple,
  ArrowLeft,
  Link as LinkIcon,
  SpeakerHigh,
  SpeakerSlash,
  ArrowsClockwise,
  ShareNetwork,
  Microphone,
  Plus,
  ChatCircleDots,
  HandTap,
  StopCircle,
} from "@phosphor-icons/react";
import {
  saveInsight,
  regenerateInsight,
  streamMore,
  streamRewrite,
  streamDeeper,
  streamExplain,
  streamAnswer,
  streamCommand,
  fetchTTS,
} from "@/lib/api";
import { trackBehavior } from "@/lib/track";
import ShareModal from "@/components/ShareModal";
import VoiceRecorder from "@/components/VoiceRecorder";
import InsightSheet from "@/components/InsightSheet";
import MagicDiaryCard from "@/components/MagicDiaryCard";
import SwipeStack from "@/components/SwipeStack";
import HotHeaderPill from "@/components/HotHeaderPill";

const DOUBLE_TAP_MS = 320;

export default function Feed() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const initial = state?.data;

  const containerRef = useRef(null);
  const hasSwipedRef = useRef(false);
  const rootTopic = initial?.topic || "";
  const rootSessionId = initial?.session_id || "";

  // Card-stack navigation — each deck is a group of insights (main, deeper, explain, answer)
  const [deckStack, setDeckStack] = useState(() => (
    initial ? [{
      id: "main",
      kind: "main",
      topic: rootTopic,
      insights: initial.insights || [],
      activeIdx: 0,
    }] : []
  ));

  const currentDeck = deckStack[deckStack.length - 1];
  const insights = currentDeck?.insights || [];
  const activeIdx = currentDeck?.activeIdx || 0;
  const total = insights.length;
  const stackDepth = deckStack.length - 1;

  const [hasSwiped, setHasSwiped] = useState(false);
  const [showDeeperHint, setShowDeeperHint] = useState(true);
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [rewritingId, setRewritingId] = useState(null);
  const [rewritingText, setRewritingText] = useState("");
  const [listenMode, setListenMode] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchLabel, setBranchLabel] = useState("Researching");
  const [zoomIdx, setZoomIdx] = useState(-1); // idx of card currently zoom-animating

  const [shareOpen, setShareOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modalInsight, setModalInsight] = useState(null);

  // Magic Diary — Tom-Riddle-style letter-by-letter stream for voice replies
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [diaryPrompt, setDiaryPrompt] = useState("");
  const [diaryText, setDiaryText] = useState("");
  const [diaryStreaming, setDiaryStreaming] = useState(false);
  const [diaryError, setDiaryError] = useState("");

  const audioRef = useRef(null);
  const listenModeRef = useRef(false);
  const activeIdxRef = useRef(0);
  const deckStackRef = useRef(deckStack);
  const lastTapRef = useRef({ time: 0, timeoutId: null });
  const abortRef = useRef(null); // AbortController for in-flight branch SSE
  const historyGuardRef = useRef(false);

  useEffect(() => { listenModeRef.current = listenMode; }, [listenMode]);
  useEffect(() => { activeIdxRef.current = activeIdx; }, [activeIdx]);
  useEffect(() => { deckStackRef.current = deckStack; }, [deckStack]);

  useEffect(() => {
    if (!initial) navigate("/", { replace: true });
  }, [initial, navigate]);

  // ============ iOS/Android back button — pop deck OR previous card ============
  useEffect(() => {
    // Seed history so first back press has something to pop into
    if (!historyGuardRef.current) {
      historyGuardRef.current = true;
      try { window.history.pushState({ feedGuard: true }, ""); } catch {}
    }
    const onPop = () => {
      const stack = deckStackRef.current;
      // Case A: inside a nested deck (deeper / explain / answer) → pop the deck
      if (stack.length > 1) {
        setDeckStack((cur) => cur.slice(0, -1));
        try { window.history.pushState({ feedGuard: true }, ""); } catch {}
        setTimeout(() => {
          const prev = deckStackRef.current[deckStackRef.current.length - 1];
          if (prev) scrollToIdx(prev.activeIdx);
        }, 80);
        return;
      }
      // Case B: on the main deck → back always goes to the PREVIOUS PAGE
      // (Directions), never card-by-card and never forced to Landing.
      // Card navigation is done via swipe; back is for page navigation.
      window.removeEventListener("popstate", onPop);
      navigate(-1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============ iOS audio: stop when tab is hidden ============
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        stopAudio();
        setListenMode(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showDeeperHint) return;
    const t = setTimeout(() => setShowDeeperHint(false), 6500);
    return () => clearTimeout(t);
  }, [showDeeperHint]);

  // Dwell / skip tracking on active card change (main deck only)
  const dwellStartRef = useRef(Date.now());
  const lastTrackedIdxRef = useRef(-1);
  useEffect(() => {
    if (currentDeck?.kind !== "main") { lastTrackedIdxRef.current = -1; return; }
    const prevIdx = lastTrackedIdxRef.current;
    if (prevIdx !== -1 && prevIdx !== activeIdx) {
      const dwellMs = Date.now() - dwellStartRef.current;
      const prevInsight = insights[prevIdx];
      if (prevInsight) {
        trackBehavior({
          sessionId: rootSessionId,
          insightId: prevInsight.id,
          topic: prevInsight.topic,
          headline: prevInsight.headline,
          event: dwellMs < 4000 ? "skip" : "dwell",
          dwellMs,
        });
      }
      setHasSwiped(true);
    }
    dwellStartRef.current = Date.now();
    lastTrackedIdxRef.current = activeIdx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, currentDeck?.id]);

  // IntersectionObserver removed — SwipeStack is the single source of truth for activeIdx.
  // No-op effect kept out; activeIdx is fully controlled via updateTopDeck.

  const scrollToIdx = useCallback((idx) => {
    setDeckStack((cur) => {
      if (cur.length === 0) return cur;
      const clone = [...cur];
      const top = clone[clone.length - 1];
      const clamped = Math.max(0, Math.min(idx, (top.insights?.length || 1) - 1));
      clone[clone.length - 1] = { ...top, activeIdx: clamped };
      return clone;
    });
  }, []);

  const updateTopDeck = (patch) => {
    setDeckStack((cur) => {
      if (cur.length === 0) return cur;
      const clone = [...cur];
      clone[clone.length - 1] = { ...clone[clone.length - 1], ...patch };
      return clone;
    });
  };

  const pushDeck = (deck) => {
    setDeckStack((cur) => [...cur, deck]);
    // Push a history entry so the browser back button pops the deck
    try { window.history.pushState({ feedGuard: true, deck: deck.id }, ""); } catch {}
  };

  const popDeck = () => {
    if (deckStack.length <= 1) return;
    // Use browser history back — the popstate handler will pop the deck
    try { window.history.back(); } catch {
      setDeckStack((cur) => cur.slice(0, -1));
    }
  };

  // ============ Abort in-flight branch/transform SSE ============
  const startAbortable = (label = "Researching") => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setBranchLabel(label);
    setBranchLoading(true);
    return ac;
  };

  const stopBranch = () => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
      abortRef.current = null;
    }
    setBranchLoading(false);
    setLoadingMore(false);
    toast("Stopped");
  };

  const clearAbort = () => {
    abortRef.current = null;
    setBranchLoading(false);
  };

  // ============ Actions on current insight ============

  const currentInsight = insights[activeIdx];

  const handleSave = async (ins) => {
    if (!ins) return;
    if (savedIds.has(ins.id)) { toast("Already saved"); return; }
    try {
      await saveInsight(ins);
      setSavedIds((prev) => new Set(prev).add(ins.id));
      trackBehavior({ sessionId: rootSessionId, insightId: ins.id, topic: ins.topic, headline: ins.headline, event: "save" });
      toast.success("Insight saved");
    } catch { toast.error("Could not save"); }
  };

  const handleRegenerate = async (ins, idx) => {
    if (!ins) return;
    setRegeneratingId(ins.id);
    trackBehavior({ sessionId: rootSessionId, insightId: ins.id, topic: ins.topic, headline: ins.headline, event: "regenerate" });
    try {
      const excludeHeadlines = insights.filter((_, i) => i !== idx).map((x) => x.headline).filter(Boolean);
      const fresh = await regenerateInsight({
        topic: currentDeck.topic, insight_id: ins.id, previous_text: ins.text,
        exclude: [ins.headline, ...excludeHeadlines].filter(Boolean),
      });
      updateTopDeck({ insights: insights.map((x, i) => (i === idx ? fresh : x)) });
      toast.success("Regenerated");
    } catch { toast.error("Regenerate failed"); }
    finally { setRegeneratingId(null); }
  };

  // ============ Word tap / double tap ============

  const currentInsightRef = useRef(currentInsight);
  useEffect(() => { currentInsightRef.current = currentInsight; }, [currentInsight]);

  const sourceOf = (ins) => ({
    id: ins.id,
    topic: ins.topic || currentDeck?.topic || rootTopic,
    headline: ins.headline || "",
    text: ins.text || "",
    source_url: ins.source_url || null,
    source_title: ins.source_title || null,
  });

  const openExplainForPhrase = async (phrase) => {
    setShowDeeperHint(false);
    const src = currentInsightRef.current;
    if (!src) return;
    const ac = startAbortable(`Going deeper on "${phrase}"`);
    try {
      let card = null;
      for await (const ev of streamExplain({
        session_id: rootSessionId,
        topic: currentDeck.topic,
        source_insight: sourceOf(src),
        phrase,
      }, { signal: ac.signal })) {
        if (ev.phase === "done" && ev.data?.insights?.[0]) {
          card = ev.data.insights[0];
        } else if (ev.phase === "error") {
          throw new Error(ev.message);
        }
      }
      if (!card) return; // aborted or empty
      pushDeck({
        id: `explain-${Date.now()}`,
        kind: "explain",
        topic: currentDeck.topic,
        insights: [card],
        activeIdx: 0,
      });
    } catch (e) {
      if (e?.name !== "AbortError") toast.error("Couldn't explain that. Try again.");
    } finally {
      clearAbort();
    }
  };

  const triggerZoom = (idx) => {
    setZoomIdx(idx);
    setTimeout(() => setZoomIdx((cur) => (cur === idx ? -1 : cur)), 340);
  };

  const openDeeperForCurrent = async () => {
    setShowDeeperHint(false);
    const src = currentInsightRef.current;
    if (!src) return;
    triggerZoom(activeIdxRef.current);
    const ac = startAbortable("Going deeper on this insight");
    try {
      let insightsBatch = [];
      for await (const ev of streamDeeper({
        session_id: rootSessionId,
        topic: currentDeck.topic,
        source_insight: sourceOf(src),
        previous_headlines: insights.map((i) => i.headline).filter(Boolean),
      }, { signal: ac.signal })) {
        if (ev.phase === "done" && ev.data?.insights) {
          insightsBatch = ev.data.insights;
        } else if (ev.phase === "error") {
          throw new Error(ev.message);
        }
      }
      if (!insightsBatch.length) return;
      pushDeck({
        id: `deeper-${Date.now()}`,
        kind: "deeper",
        topic: `${currentDeck.topic} — ${src.headline || "insight"}`,
        insights: insightsBatch,
        activeIdx: 0,
      });
    } catch (e) {
      if (e?.name !== "AbortError") toast.error("Couldn't go deeper. Try again.");
    } finally {
      clearAbort();
    }
  };

  const handleWordTap = (phrase) => {
    // Clear any queued single-tap
    if (lastTapRef.current.timeoutId) clearTimeout(lastTapRef.current.timeoutId);
    const now = Date.now();
    const dt = now - lastTapRef.current.time;
    lastTapRef.current.time = now;
    if (dt < DOUBLE_TAP_MS) {
      // 2nd tap = double tap → go deeper, cancel the queued explain
      lastTapRef.current.time = 0;
      lastTapRef.current.timeoutId = null;
      openDeeperForCurrent();
      return;
    }
    // schedule explain if no 2nd tap arrives quickly
    lastTapRef.current.timeoutId = setTimeout(() => {
      lastTapRef.current.timeoutId = null;
      openExplainForPhrase(phrase);
    }, DOUBLE_TAP_MS + 20);
  };

  // Empty-area double tap (not on words) — direct go-deeper
  const handleCardEmptyTap = () => {
    const now = Date.now();
    const dt = now - lastTapRef.current.time;
    lastTapRef.current.time = now;
    if (dt < DOUBLE_TAP_MS) {
      lastTapRef.current.time = 0;
      if (lastTapRef.current.timeoutId) clearTimeout(lastTapRef.current.timeoutId);
      lastTapRef.current.timeoutId = null;
      openDeeperForCurrent();
    }
  };

  // ============ Questions & unified InsightSheet ============

  const handleQuestionPicked = async (question) => {
    const src = currentInsightRef.current;
    if (!src) return;
    const ac = startAbortable("Answering");

    // Background: reshape upcoming main-deck insights
    const reshapePromise = (async () => {
      try {
        const mainDeck = deckStackRef.current.find((d) => d.kind === "main");
        if (!mainDeck) return;
        for await (const ev of streamMore({
          session_id: rootSessionId,
          topic: rootTopic,
          previous_headlines: mainDeck.insights.map((i) => i.headline).filter(Boolean),
          steer: question,
        })) {
          if (ev.phase === "done" && ev.data?.insights) {
            setDeckStack((cur) => cur.map((d) => {
              if (d.kind !== "main") return d;
              const keepUpTo = Math.min(d.activeIdx + 1, d.insights.length);
              return { ...d, insights: [...d.insights.slice(0, keepUpTo), ...ev.data.insights] };
            }));
          }
        }
      } catch { /* silent */ }
    })();

    try {
      let answerCard = null;
      for await (const ev of streamAnswer({
        session_id: rootSessionId,
        topic: currentDeck.topic,
        source_insight: sourceOf(src),
        question,
        previous_headlines: insights.map((i) => i.headline).filter(Boolean),
      }, { signal: ac.signal })) {
        if (ev.phase === "done" && ev.data?.insights?.[0]) {
          answerCard = ev.data.insights[0];
        } else if (ev.phase === "error") {
          throw new Error(ev.message);
        }
      }
      if (!answerCard) return;
      pushDeck({
        id: `answer-${Date.now()}`,
        kind: "answer",
        topic: currentDeck.topic,
        insights: [answerCard],
        activeIdx: 0,
      });
      trackBehavior({ sessionId: rootSessionId, insightId: src.id, topic: src.topic, headline: src.headline, event: "ask" });
    } catch (e) {
      if (e?.name !== "AbortError") toast.error("Couldn't answer that.");
    } finally {
      clearAbort();
    }

    reshapePromise; // fire-and-forget
  };

  // ============ Unified command from Chat input OR Mic ============

  const runCommand = async (message, channel = "text") => {
    const src = currentInsightRef.current;
    if (!src) return;
    if (!message?.trim()) return;
    setMicBusy(channel === "voice");
    const isVoice = channel === "voice";

    const payload = {
      session_id: rootSessionId,
      topic: currentDeck.topic,
      current_insight: sourceOf(src),
      insights: insights.map(sourceOf),
      message: message.trim(),
      channel,
    };

    let mode = null;
    let rewriteBuffer = "";
    const beforeLen = insights.length;
    const rewriteToastId = `cmd-rewrite-${Date.now()}`;
    const transformToastId = `cmd-transform-${Date.now()}`;
    const steerToastId = `cmd-steer-${Date.now()}`;
    const chatToastId = `cmd-chat-${Date.now()}`;
    let chatBuffer = "";

    const ac = startAbortable("Thinking");

    try {
      for await (const ev of streamCommand(payload, { signal: ac.signal })) {
        if (ev.phase === "mode") {
          mode = ev.mode;
          if (mode === "rewrite") {
            setRewritingId(src.id);
            setRewritingText("");
            if (!isVoice) toast.loading("Rewriting this insight…", { id: rewriteToastId });
            setBranchLabel("Rewriting");
            // Voice → rewrite: close the diary; the card itself is the canvas
            if (isVoice) setDiaryOpen(false);
          } else if (mode === "steer") {
            if (!isVoice) toast.loading("Steering your feed…", { id: steerToastId });
            setLoadingMore(true);
            setBranchLabel("Reshaping");
            if (isVoice) setDiaryOpen(false);
          } else if (mode === "transform") {
            if (!isVoice) toast.loading("Transforming all cards…", { id: transformToastId });
            setBranchLabel("Transforming");
            if (isVoice) setDiaryOpen(false);
          } else if (mode === "chat") {
            if (isVoice) {
              // Diary is already open (set in handleVoiceResult) — just mark streaming
              setDiaryText("");
              setDiaryStreaming(true);
              setDiaryError("");
            } else {
              toast.loading("Thinking…", { id: chatToastId });
            }
            setBranchLabel("Thinking");
          }
          continue;
        }
        if (ev.phase === "delta" && mode === "rewrite") {
          rewriteBuffer += ev.delta || "";
          setRewritingText(rewriteBuffer.split(/^HEADLINE:/im)[0].trim());
          continue;
        }
        if (ev.phase === "delta" && mode === "chat") {
          chatBuffer += ev.delta || "";
          if (isVoice) {
            setDiaryText(chatBuffer);
          } else {
            toast.loading(chatBuffer.slice(-140), { id: chatToastId });
          }
          continue;
        }
        if (ev.phase === "done" && mode === "rewrite" && ev.data) {
          const { headline: newH, text: newT } = ev.data;
          setDeckStack((cur) => {
            if (cur.length === 0) return cur;
            const clone = [...cur];
            const top = clone[clone.length - 1];
            clone[clone.length - 1] = {
              ...top,
              insights: top.insights.map((x) => x.id === src.id
                ? { ...x, headline: newH || x.headline, text: newT || x.text }
                : x),
            };
            return clone;
          });
          setRewritingId(null);
          setRewritingText("");
          if (!isVoice) toast.success("Updated", { id: rewriteToastId });
          else toast.success("Card rewritten by your voice");
          continue;
        }
        if (ev.phase === "done" && mode === "steer" && ev.data) {
          setDeckStack((cur) => {
            if (cur.length === 0) return cur;
            const clone = [...cur];
            const top = clone[clone.length - 1];
            clone[clone.length - 1] = { ...top, insights: [...top.insights, ...ev.data.insights] };
            return clone;
          });
          if (!isVoice) toast.success("Feed steered", { id: steerToastId, description: `"${message.slice(0, 60)}${message.length > 60 ? "…" : ""}"` });
          else toast.success("Feed steered by your voice");
          setTimeout(() => scrollToIdx(beforeLen), 200);
          continue;
        }
        if (ev.phase === "done" && mode === "transform" && ev.data) {
          setDeckStack((cur) => {
            if (cur.length === 0) return cur;
            const clone = [...cur];
            const top = clone[clone.length - 1];
            clone[clone.length - 1] = { ...top, insights: ev.data.insights };
            return clone;
          });
          if (!isVoice) toast.success("All cards transformed", { id: transformToastId });
          else toast.success("All cards transformed by your voice");
          continue;
        }
        if (ev.phase === "done" && mode === "chat") {
          const finalMsg = chatBuffer.trim() || "Done";
          if (isVoice) {
            setDiaryText(finalMsg);
            setDiaryStreaming(false);
          } else {
            toast.success(finalMsg, { id: chatToastId, duration: 8000 });
          }
          continue;
        }
        if (ev.phase === "error") throw new Error(ev.message || "Command failed");
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        if (isVoice && (mode === "chat" || mode == null)) {
          setDiaryError("The ink dried. Try speaking again.");
          setDiaryStreaming(false);
        } else {
          toast.error("Command failed", { id: rewriteToastId });
        }
      } else if (isVoice && (mode === "chat" || mode == null)) {
        setDiaryStreaming(false);
      }
      setRewritingId(null); setRewritingText("");
    } finally {
      setMicBusy(false);
      setLoadingMore(false);
      clearAbort();
    }
  };

  // ============ Mic voice → runCommand (unified endpoint) ============

  const handleVoiceResult = async (transcript) => {
    if (!transcript || micBusy) return;
    // Open the magic diary immediately with the user's spoken words so the
    // reveal begins before the LLM classifies the command.
    setDiaryPrompt(transcript);
    setDiaryText("");
    setDiaryError("");
    setDiaryStreaming(true);
    setDiaryOpen(true);
    await runCommand(transcript, "voice");
  };

  const closeDiary = () => {
    setDiaryOpen(false);
    setDiaryText("");
    setDiaryPrompt("");
    setDiaryError("");
    setDiaryStreaming(false);
  };

  // ============ Listen mode ============

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      try { audioRef.current.src = ""; } catch {}
      audioRef.current = null;
    }
  }, []);

  const playInsight = useCallback(async (idx, autoAdvance = false) => {
    const deck = deckStackRef.current[deckStackRef.current.length - 1];
    const ins = deck?.insights?.[idx];
    if (!ins) return;
    stopAudio();
    try {
      const textToSpeak = ins.headline ? `${ins.headline}. ${ins.text}` : ins.text;
      const blob = await fetchTTS(textToSpeak, "sage");
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      // iOS: allow inline playback and honor mute switch behavior
      audio.setAttribute("playsinline", "true");
      audio.preload = "auto";
      audioRef.current = audio;
      audio.onended = async () => {
        URL.revokeObjectURL(url);
        if (autoAdvance && listenModeRef.current) {
          await new Promise((r) => setTimeout(r, 4000));
          if (!listenModeRef.current) return;
          const deck2 = deckStackRef.current[deckStackRef.current.length - 1];
          const next = activeIdxRef.current + 1;
          if (next < deck2.insights.length) {
            scrollToIdx(next);
            setTimeout(() => { if (listenModeRef.current) playInsight(next, true); }, 700);
          } else {
            setListenMode(false);
            toast("End of batch");
          }
        }
      };
      // iOS: play() must be triggered by a user gesture (listen button already does that)
      const p = audio.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          toast("Tap Listen again to play");
          setListenMode(false);
        });
      }
    } catch { toast.error("Voice unavailable"); setListenMode(false); }
  }, [scrollToIdx, stopAudio]);

  const toggleListenMode = () => {
    if (listenMode) { setListenMode(false); stopAudio(); toast("Listen mode off"); }
    else {
      setListenMode(true);
      toast("Listen mode on", { description: "Auto-advancing hands-free" });
      playInsight(activeIdx, true);
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    const ac = startAbortable("Loading more");
    const currentCount = insights.length;
    try {
      let done = false;
      for await (const ev of streamMore({
        session_id: rootSessionId, topic: currentDeck.topic,
        previous_headlines: insights.map((i) => i.headline).filter(Boolean),
      }, { signal: ac.signal })) {
        if (ev.phase === "done" && ev.data) {
          setDeckStack((cur) => {
            if (cur.length === 0) return cur;
            const clone = [...cur];
            const top = clone[clone.length - 1];
            clone[clone.length - 1] = { ...top, insights: [...top.insights, ...ev.data.insights] };
            return clone;
          });
          done = true;
        }
      }
      if (done) {
        toast.success("12 more insights ready");
        setTimeout(() => scrollToIdx(currentCount), 200);
      } else toast.error("Could not load more");
    } catch (e) {
      if (e?.name !== "AbortError") toast.error("Could not load more");
    } finally {
      setLoadingMore(false);
      clearAbort();
    }
  };

  const openShare = (ins) => {
    trackBehavior({ sessionId: rootSessionId, insightId: ins.id, topic: ins.topic, headline: ins.headline, event: "share" });
    setModalInsight(ins); setShareOpen(true);
  };
  const openSheet = (ins) => { setModalInsight(ins); setSheetOpen(true); };

  useEffect(() => stopAudio, [stopAudio]);

  if (!initial) return null;

  const showEndCta = currentDeck?.kind === "main";
  const shareTarget = currentInsight;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0C0C0D]">
      {/* Top bar — Back on left, Share on right */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between gap-2 px-3 pt-3 sm:px-5 sm:pt-5">
        <button
          data-testid={stackDepth > 0 ? "deck-back" : "back-home"}
          onClick={() => stackDepth > 0 ? popDeck() : navigate(-1)}
          className="pointer-events-auto flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#121214]/95 text-white/80 backdrop-blur-md no-tap-zoom"
          aria-label={stackDepth > 0 ? "Back to previous" : "Home"}
        >
          <ArrowLeft size={16} />
        </button>

        <div className="pointer-events-auto min-w-0 flex-1 truncate rounded-full border border-white/10 bg-[#121214]/95 px-3 py-1.5 text-center font-ui text-[11px] tracking-wide text-white/70 backdrop-blur-md">
          {currentDeck?.kind === "deeper" && "Deeper · "}
          {currentDeck?.kind === "explain" && "Explain · "}
          {currentDeck?.kind === "answer" && "Answer · "}
          {currentDeck?.topic || rootTopic}
        </div>

        <HotHeaderPill compact />

        <button
          data-testid="share-top"
          onClick={() => shareTarget && openShare(shareTarget)}
          className="pointer-events-auto flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#121214]/95 text-white/80 backdrop-blur-md no-tap-zoom"
          aria-label="Share"
        >
          <ShareNetwork size={16} />
        </button>
      </header>

      {/* Progress */}
      <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center sm:top-16" data-testid="progress-indicator">
        <span className="font-ui text-[10px] uppercase tracking-[0.32em] text-white/45">
          {String(Math.min(activeIdx + 1, total)).padStart(2, "0")}
          <span className="mx-1.5 text-white/20">/</span>
          {String(total).padStart(2, "0")}
        </span>
      </div>

      {/* Listen mode indicator */}
      <AnimatePresence>
        {listenMode && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="pointer-events-none absolute inset-x-0 top-24 z-20 flex justify-center"
          >
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-[#121214]/85 px-3 py-1 backdrop-blur-md">
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ repeat: Infinity, duration: 1.4 }}
                className="h-1.5 w-1.5 rounded-full bg-white"
              />
              <span className="font-ui text-[9px] uppercase tracking-[0.24em] text-white/70">
                Hands-free · Listening
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Swipe stack (TikTok/Instagram-style — one swipe = next card) */}
      <SwipeStack
        key={currentDeck?.id}
        total={insights.length + (showEndCta ? 1 : 0)}
        activeIdx={activeIdx}
        onIndexChange={(nextIdx) => {
          if (!hasSwipedRef.current) {
            hasSwipedRef.current = true;
            setHasSwiped(true);
          }
          updateTopDeck({ activeIdx: nextIdx });
        }}
        disabled={sheetOpen || voiceOpen || shareOpen}
        renderCard={(idx) => {
          if (idx < insights.length) {
            const ins = insights[idx];
            return (
              <InsightCard
                key={ins.id + "-" + idx}
                insight={ins} idx={idx} total={total}
                deckKind={currentDeck?.kind}
                saved={savedIds.has(ins.id)}
                regenerating={regeneratingId === ins.id}
                rewritingText={rewritingId === ins.id ? rewritingText : null}
                branchActive={branchLoading && idx === activeIdx}
                zooming={zoomIdx === idx}
                onWordTap={handleWordTap}
                onEmptyTap={handleCardEmptyTap}
                onSave={() => handleSave(ins)}
                onSheet={() => openSheet(ins)}
                onRegenerate={() => handleRegenerate(ins, idx)}
                onListen={toggleListenMode}
                listenActive={listenMode}
                onMic={() => setVoiceOpen(true)}
                micBusy={micBusy}
                showInteractionHint={idx === activeIdx && currentDeck?.kind === "main"}
              />
            );
          }
          if (showEndCta && idx === insights.length) {
            return (
              <EndCtaCard
                total={total}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
                onStop={stopBranch}
                idx={total}
              />
            );
          }
          return null;
        }}
      />

      {/* Prev/Next arrows — hidden after first swipe */}
      <AnimatePresence>
        {!hasSwiped && insights.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-y-0 right-3 z-20 flex flex-col items-center justify-center gap-3"
          >
            <button
              data-testid="prev-insight"
              onClick={() => activeIdx > 0 && scrollToIdx(activeIdx - 1)}
              disabled={activeIdx === 0}
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#121214]/70 text-white/80 backdrop-blur-md transition-opacity disabled:opacity-20"
              aria-label="Previous"
            >
              <ArrowUp size={16} />
            </button>
            <button
              data-testid="next-insight"
              onClick={() => activeIdx < total - 1 && scrollToIdx(activeIdx + 1)}
              disabled={activeIdx === total - 1}
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#121214]/70 text-white/80 backdrop-blur-md transition-opacity disabled:opacity-20"
              aria-label="Next"
            >
              <ArrowDown size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Swipe-up hint on first card */}
      <AnimatePresence>
        {activeIdx === 0 && !hasSwiped && !listenMode && !rewritingId && currentDeck?.kind === "main" && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ delay: 1.2, duration: 0.6 }}
            className="pointer-events-none absolute inset-x-0 bottom-28 z-10 flex flex-col items-center gap-2"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-white/20 text-white/50"
            >
              <ArrowUp size={12} />
            </motion.div>
            <p className="font-ui text-[10px] uppercase tracking-[0.28em] text-white/35">Swipe up</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Double-tap hint */}
      <AnimatePresence>
        {showDeeperHint && activeIdx === 0 && currentDeck?.kind === "main" && insights.length > 0 && !branchLoading && (
          <motion.button
            data-testid="deeper-hint"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            transition={{ delay: 3, duration: 0.5 }}
            onClick={() => setShowDeeperHint(false)}
            className="pointer-events-auto absolute inset-x-0 bottom-40 z-10 mx-auto flex w-fit items-center gap-2 rounded-full border border-white/15 bg-[#121214]/90 px-4 py-2 backdrop-blur-md"
          >
            <HandTap size={13} weight="regular" className="text-white/75" />
            <span className="font-ui text-[10px] uppercase tracking-[0.24em] text-white/75">
              Double tap to go deeper
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Branch loading overlay with STOP button */}
      <AnimatePresence>
        {branchLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="absolute inset-x-0 bottom-24 z-30 flex justify-center px-4"
          >
            <div className="flex max-w-[90vw] items-center gap-3 rounded-2xl border border-white/15 bg-[#121214]/95 py-2.5 pl-4 pr-2 backdrop-blur-md">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                className="h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 border-white/20 border-t-white"
              />
              <span className="min-w-0 flex-1 truncate font-ui text-[11px] font-medium text-white/85">
                {branchLabel}…
              </span>
              <button
                data-testid="stop-branch"
                onClick={stopBranch}
                className="ml-1 flex flex-shrink-0 items-center gap-1 rounded-full bg-white/95 py-1 pl-1.5 pr-2.5 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0C0C0D]"
                aria-label="Stop"
              >
                <StopCircle size={13} weight="fill" />
                Stop
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} insight={modalInsight} />
      <VoiceRecorder open={voiceOpen} onClose={() => setVoiceOpen(false)} onResult={handleVoiceResult} />
      <MagicDiaryCard
        open={diaryOpen}
        prompt={diaryPrompt}
        fullText={diaryText}
        streaming={diaryStreaming}
        error={diaryError}
        onClose={closeDiary}
      />
      <InsightSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        sessionId={rootSessionId}
        insight={modalInsight}
        insights={insights}
        topic={currentDeck?.topic || rootTopic}
        onPickQuestion={handleQuestionPicked}
        onDelegateCommand={(msg /*, mode */) => runCommand(msg, "text")}
      />
    </div>
  );
}

// ============ Word-by-word emerge (rewrite streaming) ============
function EmergingText({ text }) {
  const words = (text || "").split(/(\s+)/);
  return (
    <span>
      {words.map((w, i) => (
        <motion.span
          key={`${i}-${w}`}
          initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="inline"
        >
          {w}
        </motion.span>
      ))}
    </span>
  );
}

// ============ Insight card ============
function InsightCard({
  insight, idx, total, deckKind,
  saved, regenerating, rewritingText, branchActive, zooming,
  onWordTap, onEmptyTap,
  onSave, onSheet, onRegenerate, onListen, listenActive, onMic, micBusy,
  showInteractionHint,
}) {
  const isRewriting = rewritingText !== null && rewritingText !== undefined;
  const contentRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  // ---- Auto-fit: truncate body text at a sentence boundary so a card
  // never ends mid-sentence. Iteratively drops the trailing sentence and
  // re-measures until the paragraph fits inside the visible box.
  const fullText = insight?.text || "";
  const [fittedText, setFittedText] = useState(fullText);

  // Reset when the underlying text or card identity changes
  useEffect(() => {
    setFittedText(fullText);
  }, [insight?.id, fullText]);

  // Iteratively shrink to fit. Each render trims at most one sentence,
  // which triggers another layout and another measurement — converges
  // in O(sentences) frames (usually 2-6). Skipped while rewriting so the
  // streaming EmergingText isn't clipped.
  useLayoutEffect(() => {
    if (isRewriting) return;
    const el = contentRef.current;
    if (!el) return;
    const overflow = el.scrollHeight - el.clientHeight;
    setIsOverflowing(overflow > 2);
    if (overflow <= 2) return;
    if (!fittedText) return;

    // Split into sentences, preserving the closing punctuation + trailing
    // whitespace so joining is lossless. Falls back to word-boundary if
    // the text has no sentence terminators.
    const sentences =
      fittedText.match(/[^.!?]+[.!?]+["')\]]*\s*/g) ||
      fittedText.split(/(?<=\s)/);

    if (sentences.length <= 1) {
      // Single sentence still overflows — hard word-boundary trim as a
      // safety net so it never ends mid-word.
      const words = fittedText.trimEnd().split(/\s+/);
      if (words.length <= 4) return; // give up (leave the fade)
      const shorter = words.slice(0, -Math.max(1, Math.floor(words.length * 0.1))).join(" ").replace(/[,;:—-]+$/, "") + "…";
      if (shorter && shorter !== fittedText) setFittedText(shorter);
      return;
    }

    // Drop the last sentence, keep clean punctuation + ellipsis
    const trimmed = sentences.slice(0, -1).join("").replace(/\s+$/, "").replace(/…+$/, "").replace(/[,;:—-]+$/, "");
    if (!trimmed) return;
    const next = trimmed + "…";
    if (next !== fittedText) setFittedText(next);
  }, [fittedText, isRewriting, insight?.headline, showInteractionHint]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const check = () => setIsOverflowing(el.scrollHeight > el.clientHeight + 4);
    check();
    const ro = new ResizeObserver(() => {
      // Reset to full text on resize so the fit loop re-runs against
      // the new available height.
      setFittedText(fullText);
      check();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullText]);

  return (
    <section
      data-idx={idx}
      data-testid={`insight-card-${idx}`}
      className={`relative h-full w-full no-tap-zoom ${zooming ? "card-zoom" : ""}`}
    >
      {/* Card content — constrained between top bar (72px) and action bar (~90px) */}
      <div
        onClick={onEmptyTap}
        className="absolute inset-x-0 top-[76px] bottom-[92px] flex flex-col px-5 sm:px-8"
        style={{ touchAction: "pan-y" }}
      >
        <p className="mb-4 font-ui text-[10px] uppercase tracking-[0.32em] text-white/40 flex items-center gap-2 flex-wrap">
          <span>
            {deckKind === "deeper" && "Deeper · "}
            {deckKind === "explain" && "Explain · "}
            {deckKind === "answer" && "Answer · "}
            Insight · {String(idx + 1).padStart(2, "0")}
          </span>
          {insight.rail && (
            <span
              data-testid={`insight-rail-${idx}`}
              className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.05] px-2 py-0.5 text-[9px] font-semibold tracking-[0.22em] text-white/75"
              title={insight.interest ? `Persona · ${insight.rail} — ${insight.interest}` : `Persona · ${insight.rail}`}
            >
              <span className="h-1 w-1 rounded-full bg-white/70" />
              {insight.rail}
              {insight.interest && insight.interest.toLowerCase() !== insight.rail.toLowerCase() && (
                <span className="text-white/40 tracking-[0.16em]">· {insight.interest}</span>
              )}
            </span>
          )}
        </p>

        {/* Content — always faded/clipped, never scrollable. An inner
            overflow-y-auto steals the FIRST touch on mobile and produces a
            two-swipe feel. Long content is truncated via mask; users can
            still tap "deeper" or "explain" to get more detail. */}
        <div
          className="mx-auto w-full max-w-lg flex-1 min-h-0 relative"
          style={{ touchAction: "pan-y" }}
        >
          <div
            ref={contentRef}
            className="h-full w-full pr-1"
            style={{
              maskImage: "linear-gradient(180deg, rgba(0,0,0,1) 88%, rgba(0,0,0,0) 100%)",
              WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,1) 88%, rgba(0,0,0,0) 100%)",
              overflow: "hidden",
              touchAction: "pan-y",
            }}
          >
            {insight.headline && !isRewriting && (
              <h2 className="mb-5 font-editorial text-2xl leading-tight text-white sm:text-3xl">
                {insight.headline}
              </h2>
            )}

            {isRewriting ? (
              <p data-testid={`insight-text-${idx}`}
                 className="font-editorial text-lg leading-[1.55] text-white sm:text-xl">
                <EmergingText text={rewritingText || "…"} />
                <motion.span
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ repeat: Infinity, duration: 0.9 }}
                  className="ml-1 inline-block h-4 w-[2px] translate-y-0.5 bg-white/70"
                />
              </p>
            ) : (
              <p className="font-editorial text-lg leading-[1.55] text-white/90 sm:text-xl"
                 data-testid={`insight-text-${idx}`}>
                {fittedText || ""}
              </p>
            )}

            {insight.source_url && !isRewriting && (
              <a
                href={insight.source_url}
                target="_blank"
                rel="noreferrer"
                data-testid={`insight-source-${idx}`}
                onClick={(e) => e.stopPropagation()}
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 font-ui text-[11px] text-white/60 transition-colors hover:border-white/25 hover:text-white/90"
              >
                <LinkIcon size={12} weight="regular" />
                {insight.source_title
                  ? insight.source_title.slice(0, 50) + (insight.source_title.length > 50 ? "…" : "")
                  : "Source"}
              </a>
            )}

            {/* Persistent affordance hint — always visible so users know they can interact */}
            {showInteractionHint && !isRewriting && !branchActive && (
              <div className="mt-6 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/40 font-ui">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                  <HandTap size={11} weight="regular" />
                  Double-tap · deeper
                </span>
              </div>
            )}
          </div>
        </div>

        {regenerating && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0C0C0D]/75 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-[#121214]/80 px-5 py-3">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white" />
              <span className="font-ui text-xs uppercase tracking-[0.22em] text-white/70">Regenerating…</span>
            </div>
          </div>
        )}
      </div>

      {/* Action bar — Share removed (now in top-right). Ask+Questions merged into ChatCircleDots. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-3 sm:bottom-6">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/10 bg-[#121214]/95 px-1 py-1 backdrop-blur-xl shadow-[0_-2px_20px_rgba(0,0,0,0.35)]">
          <IconBtn testId={`save-btn-${idx}`} label={saved ? "Saved" : "Save"} onClick={(e) => { e.stopPropagation(); onSave(); }} active={saved}>
            <BookmarkSimple size={17} weight={saved ? "fill" : "regular"} />
          </IconBtn>
          <IconBtn testId={`sheet-btn-${idx}`} label="Ask" onClick={(e) => { e.stopPropagation(); onSheet(); }}>
            <ChatCircleDots size={17} weight="regular" />
          </IconBtn>
          <IconBtn testId={`listen-btn-${idx}`} label={listenActive ? "Stop" : "Listen"} onClick={(e) => { e.stopPropagation(); onListen(); }} active={listenActive}>
            {listenActive ? <SpeakerSlash size={17} weight="fill" /> : <SpeakerHigh size={17} weight="regular" />}
          </IconBtn>
          <IconBtn testId={`regenerate-btn-${idx}`} label="New" onClick={(e) => { e.stopPropagation(); onRegenerate(); }}>
            <ArrowsClockwise size={17} weight="regular" />
          </IconBtn>
          <IconBtn testId={`mic-btn-${idx}`} label="Ask by voice" onClick={(e) => { e.stopPropagation(); onMic(); }} disabled={micBusy}>
            {micBusy ? (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />
            ) : <Microphone size={17} weight="regular" />}
          </IconBtn>
        </div>
      </div>
    </section>
  );
}

function IconBtn({ children, label, onClick, testId, active, disabled }) {
  return (
    <button
      onClick={onClick} data-testid={testId} aria-label={label} disabled={disabled}
      style={{ touchAction: "manipulation" }}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:opacity-40 no-tap-zoom ${
        active ? "bg-white text-[#0C0C0D]" : "text-white/85 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

// ============ End-of-batch CTA card ============
function EndCtaCard({ total, loadingMore, onLoadMore, onStop, idx }) {
  return (
    <section
      data-idx={idx}
      data-testid="end-cta-card"
      className="relative flex h-full w-full items-center justify-center px-5 pb-20 pt-24 sm:px-8"
    >
      <div className="mx-auto w-full max-w-lg text-center">
        <p className="mb-4 font-ui text-[10px] uppercase tracking-[0.32em] text-white/40">
          End of batch · {total} insights
        </p>
        <h2 className="mb-4 font-editorial text-2xl leading-tight text-white sm:text-3xl">
          Ready for 12 more?
        </h2>
        <p className="mb-8 font-editorial text-base leading-relaxed text-white/70">
          The AI will find fresh angles you haven&rsquo;t seen yet — different players,
          different mechanics, different data.
        </p>
        {loadingMore ? (
          <div className="flex flex-col items-center gap-3">
            <button
              data-testid="load-more-btn"
              disabled
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 font-ui text-sm font-semibold uppercase tracking-[0.14em] text-[#0C0C0D] opacity-40"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                className="h-3.5 w-3.5 rounded-full border-2 border-[#0C0C0D]/20 border-t-[#0C0C0D]"
              />
              Researching…
            </button>
            <button
              data-testid="stop-load-more"
              onClick={onStop}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 font-ui text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80"
            >
              <StopCircle size={14} weight="fill" />
              Stop
            </button>
          </div>
        ) : (
          <button
            data-testid="load-more-btn"
            onClick={onLoadMore}
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 font-ui text-sm font-semibold uppercase tracking-[0.14em] text-[#0C0C0D] transition-opacity"
          >
            <Plus size={15} weight="bold" />
            Generate 12 More
          </button>
        )}
      </div>
    </section>
  );
}
