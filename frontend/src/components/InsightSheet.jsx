import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkle, ArrowUpRight, PaperPlaneRight } from "@phosphor-icons/react";
import { fetchQuestions, streamCommand } from "@/lib/api";
import { toast } from "sonner";

/**
 * Unified insight sheet:
 *   - Top: 5 LLM-suggested follow-up questions.
 *   - Bottom: chat input that streams the answer INLINE inside the sheet
 *     (chat mode). For rewrite / steer / transform intents the sheet closes
 *     and Feed handles the mutation.
 *
 * Props:
 *   sessionId, topic          — passed down for /command/stream calls
 *   insight, insights         — current card + full deck
 *   onPickQuestion(question)  — user tapped a suggested question
 *   onDelegateCommand(msg)    — non-chat intents (rewrite/steer/transform) bubble
 *                               back up to Feed; sheet closes.
 */
export default function InsightSheet({
  open,
  onClose,
  sessionId,
  insight,
  insights = [],
  topic,
  onPickQuestion,
  onDelegateCommand,
}) {
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]); // [{role:'user'|'assistant', text}]
  const [streaming, setStreaming] = useState(false);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!open || !insight) return;
    let cancelled = false;
    setLoading(true);
    setQuestions([]);
    setInput("");
    setMessages([]);
    (async () => {
      try {
        const data = await fetchQuestions({
          topic,
          source_insight: sourceOfInsight(insight, topic),
        });
        if (!cancelled) setQuestions(data.questions || []);
      } catch {
        if (!cancelled) toast.error("Couldn't fetch questions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch {}
        abortRef.current = null;
      }
    };
  }, [open, insight, topic]);

  // Autoscroll chat to bottom on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const send = async () => {
    const t = input.trim();
    if (!t || streaming) return;
    setInput("");

    // Optimistically push user bubble
    setMessages((cur) => [...cur, { role: "user", text: t }]);

    // Kick off the /command/stream call. If backend classifies as `chat`,
    // stream the answer INSIDE the sheet. If any other mode, close the
    // sheet and let Feed run the mutation via onDelegateCommand.
    const ac = new AbortController();
    abortRef.current = ac;
    setStreaming(true);

    const payload = {
      session_id: sessionId,
      topic,
      current_insight: sourceOfInsight(insight, topic),
      insights: (insights || []).map((i) => sourceOfInsight(i, topic)),
      message: t,
      channel: "text",
      history: [],
    };

    try {
      let mode = null;
      let buf = "";
      let assistantOpen = false;
      for await (const ev of streamCommand(payload, { signal: ac.signal })) {
        if (ev.phase === "mode") {
          mode = ev.mode;
          if (mode !== "chat") {
            // Non-chat: hand off to Feed and close the sheet.
            onDelegateCommand?.(t, mode);
            onClose();
            return;
          }
          // chat mode — open an empty assistant bubble
          setMessages((cur) => [...cur, { role: "assistant", text: "" }]);
          assistantOpen = true;
          continue;
        }
        if (ev.phase === "delta" && mode === "chat") {
          buf += ev.delta || "";
          setMessages((cur) => {
            const clone = cur.slice();
            const last = clone[clone.length - 1];
            if (last && last.role === "assistant") {
              clone[clone.length - 1] = { ...last, text: buf };
            }
            return clone;
          });
          continue;
        }
        if (ev.phase === "done" && mode === "chat") {
          break;
        }
        if (ev.phase === "error") {
          toast.error(ev.message || "Chat failed");
          if (assistantOpen) {
            setMessages((cur) => {
              const clone = cur.slice();
              const last = clone[clone.length - 1];
              if (last && last.role === "assistant" && !last.text) {
                clone.pop();
              }
              return clone;
            });
          }
          break;
        }
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        toast.error("Message failed");
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    send();
  };

  const stopStreaming = () => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
      abortRef.current = null;
    }
    setStreaming(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={() => { stopStreaming(); onClose(); }}
            data-testid="insight-sheet-backdrop"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-3xl border-t border-white/10 bg-[#0F0F11] pb-[max(env(safe-area-inset-bottom),0.5rem)]"
            data-testid="insight-sheet"
          >
            {/* Grabber */}
            <div className="flex justify-center pt-3">
              <div className="h-1 w-10 rounded-full bg-white/15" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-2 pt-3">
              <div className="flex items-center gap-2">
                <Sparkle size={14} weight="fill" className="text-white/70" />
                <p className="font-ui text-[10px] uppercase tracking-[0.28em] text-white/50">
                  Ask · Explore
                </p>
              </div>
              <button
                data-testid="insight-sheet-close"
                onClick={() => { stopStreaming(); onClose(); }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/80"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <p className="px-5 pb-3 font-editorial text-sm italic text-white/60 line-clamp-2">
              {insight?.headline || insight?.text?.slice(0, 90)}
            </p>

            {/* Body: scroll region. If no messages, show suggested questions.
                Once a chat starts, questions collapse to a small strip. */}
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
              data-testid="insight-sheet-body"
            >
              {/* Suggested questions strip */}
              {messages.length === 0 ? (
                <div className="space-y-2">
                  {loading &&
                    [0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-14 animate-pulse rounded-2xl border border-white/5 bg-white/[0.02]"
                      />
                    ))}
                  {!loading &&
                    questions.map((q, i) => (
                      <button
                        key={i}
                        data-testid={`question-${i}`}
                        onClick={() => {
                          onPickQuestion?.(q);
                          onClose();
                        }}
                        className="group flex w-full items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-left transition-colors hover:border-white/25 hover:bg-white/[0.06]"
                      >
                        <span className="font-editorial text-[15px] leading-snug text-white/90">
                          {q}
                        </span>
                        <ArrowUpRight
                          size={14}
                          className="mt-1 flex-shrink-0 text-white/30 transition-colors group-hover:text-white/80"
                        />
                      </button>
                    ))}
                </div>
              ) : (
                <>
                  {/* Compact question chips at the top once a chat exists */}
                  {questions.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-1.5" data-testid="question-chips">
                      {questions.slice(0, 5).map((q, i) => (
                        <button
                          key={i}
                          data-testid={`question-chip-${i}`}
                          onClick={() => { setInput(q); inputRef.current?.focus(); }}
                          className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-ui text-[10px] uppercase tracking-[0.16em] text-white/60 transition-colors hover:border-white/25 hover:text-white/90"
                        >
                          {q.length > 40 ? q.slice(0, 40) + "…" : q}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3">
                    {messages.map((m, i) => (
                      <ChatBubble key={i} role={m.role} text={m.text} testId={`chat-msg-${i}`} />
                    ))}
                    {streaming && (
                      <div className="flex items-center gap-2 pl-1 pt-1" data-testid="chat-thinking">
                        <motion.span
                          animate={{ opacity: [0.35, 1, 0.35] }}
                          transition={{ repeat: Infinity, duration: 1.4 }}
                          className="h-1.5 w-1.5 rounded-full bg-white/60"
                        />
                        <motion.span
                          animate={{ opacity: [0.35, 1, 0.35] }}
                          transition={{ repeat: Infinity, duration: 1.4, delay: 0.2 }}
                          className="h-1.5 w-1.5 rounded-full bg-white/60"
                        />
                        <motion.span
                          animate={{ opacity: [0.35, 1, 0.35] }}
                          transition={{ repeat: Infinity, duration: 1.4, delay: 0.4 }}
                          className="h-1.5 w-1.5 rounded-full bg-white/60"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Input row (chat / command) */}
            <form
              onSubmit={submit}
              className="border-t border-white/10 bg-[#0F0F11] px-4 pb-3 pt-3"
            >
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5">
                <input
                  ref={inputRef}
                  data-testid="insight-sheet-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={streaming ? "Streaming answer…" : 'Ask anything or steer — try "add examples"'}
                  disabled={streaming}
                  className="flex-1 bg-transparent font-ui text-sm outline-none placeholder:text-white/30 disabled:opacity-70"
                  autoComplete="off"
                  autoCorrect="on"
                  enterKeyHint="send"
                />
                <button
                  data-testid="insight-sheet-send"
                  type="submit"
                  disabled={!input.trim() || streaming}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white text-[#0C0C0D] transition-opacity disabled:opacity-30"
                  aria-label="Send"
                >
                  <PaperPlaneRight size={14} weight="fill" />
                </button>
              </div>
              <p className="mt-2 px-1 font-ui text-[10px] text-white/30">
                Tip: try &ldquo;add examples&rdquo;, &ldquo;use bullet points&rdquo;, &ldquo;arrange chronologically&rdquo; — those transform every card.
              </p>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ChatBubble({ role, text, testId }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        data-testid={testId}
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 font-editorial text-[15px] leading-snug ${
          isUser
            ? "bg-white text-[#0C0C0D]"
            : "border border-white/10 bg-white/[0.04] text-white/90"
        }`}
      >
        {text || (isUser ? "" : <span className="text-white/40">…</span>)}
      </div>
    </div>
  );
}

function sourceOfInsight(ins, topic) {
  return {
    id: ins?.id,
    topic: ins?.topic || topic,
    headline: ins?.headline || "",
    text: ins?.text || "",
    source_url: ins?.source_url || null,
    source_title: ins?.source_title || null,
  };
}
