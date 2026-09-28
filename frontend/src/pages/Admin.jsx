import { useEffect, useState } from "react";
import {
  fetchNewsroomStatus,
  fetchNewsroomPersonas,
  fetchNewsroomRuns,
  fetchNewsroomRunDetail,
  triggerNewsroomRun,
} from "@/lib/api";
import { toast } from "sonner";

// Small utility to render an object as key: value rows (for score breakdowns)
const KVList = ({ obj }) => {
  if (!obj || typeof obj !== "object") return null;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <span className="text-white/50">{k}</span>
          <span className="text-white/90 font-mono">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
        </div>
      ))}
    </div>
  );
};

const Pill = ({ children, tone = "default", className = "" }) => {
  const tones = {
    default: "bg-white/8 text-white/80 border-white/12",
    good: "bg-emerald-500/12 text-emerald-300 border-emerald-500/25",
    bad: "bg-rose-500/12 text-rose-300 border-rose-500/25",
    warn: "bg-amber-500/12 text-amber-300 border-amber-500/25",
    accent: "bg-fuchsia-500/12 text-fuchsia-300 border-fuchsia-500/25",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
};

const outcomeTone = (o) =>
  o === "published" ? "good"
  : o === "success" ? "good"
  : o === "dropped_at_critic" ? "warn"
  : o === "dropped_at_writer" ? "warn"
  : o === "dropped_at_chief_editor" ? "warn"
  : o === "no_signals" ? "bad"
  : o === "no_topics_passed" ? "bad"
  : "default";

// ── Persona panel ─────────────────────────────────────────────────────────
const PersonaBrief = ({ pkey, p }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-white/8 rounded-2xl p-5 bg-white/[0.02] hover:bg-white/[0.03] transition">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-white/40 font-mono">{pkey}</div>
          <h3 className="text-xl font-semibold">{p.label}</h3>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[12px] text-fuchsia-300/80 hover:text-fuchsia-300"
          data-testid={`persona-toggle-${pkey}`}
        >
          {expanded ? "− collapse" : "+ deep brief"}
        </button>
      </div>
      <p className="text-[13px] text-white/70 leading-relaxed mb-3">{p.reader}</p>
      {expanded && (
        <div className="space-y-4 mt-4 pt-4 border-t border-white/8">
          <div>
            <div className="text-[11px] uppercase text-white/40 mb-1.5 font-mono tracking-wider">reads</div>
            <ul className="text-[13px] text-white/80 space-y-1 list-disc list-inside marker:text-white/25">
              {p.reads.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-[11px] uppercase text-white/40 mb-1.5 font-mono tracking-wider">work incentives</div>
            <p className="text-[13px] text-white/80 italic">{p.work_incentives}</p>
          </div>
          <div>
            <div className="text-[11px] uppercase text-white/40 mb-1.5 font-mono tracking-wider">wow factors</div>
            <ul className="text-[13px] text-white/80 space-y-1 list-disc list-inside marker:text-emerald-400/40">
              {p.wow_factors.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-[11px] uppercase text-white/40 mb-1.5 font-mono tracking-wider">shareability triggers</div>
            <p className="text-[13px] text-white/80">{p.shareability_triggers}</p>
          </div>
          <div>
            <div className="text-[11px] uppercase text-white/40 mb-1.5 font-mono tracking-wider">depth cravings</div>
            <ul className="text-[13px] text-white/80 space-y-1 list-disc list-inside marker:text-fuchsia-400/40">
              {p.depth_cravings.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-[11px] uppercase text-white/40 mb-1.5 font-mono tracking-wider">eye-roll triggers</div>
            <ul className="text-[13px] text-white/80 space-y-1 list-disc list-inside marker:text-rose-400/40">
              {p.eye_roll_triggers.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Signal & Score cards ──────────────────────────────────────────────────
const SignalRow = ({ s }) => (
  <div className="flex items-start gap-3 py-2 border-b border-white/6 last:border-0">
    <div className="flex-1 min-w-0">
      <div className="text-[14px] text-white/90 line-clamp-2">{s.title}</div>
      <div className="text-[11px] text-white/45 mt-1 flex flex-wrap gap-2">
        {(s.sources || []).map((src) => <span key={src} className="font-mono">{src}</span>)}
      </div>
    </div>
    <div className="text-right shrink-0 text-[11px]">
      <div className="text-white/60">strength <span className="text-white/90 font-mono">{s.signal_strength}</span></div>
      <div className="text-white/60">diversity <span className="text-white/90 font-mono">{s.source_diversity}</span></div>
    </div>
  </div>
);

const ScoredTopicRow = ({ t }) => (
  <div className={`py-3 border-b border-white/6 last:border-0 ${t.keep ? "" : "opacity-55"}`}>
    <div className="flex items-start justify-between gap-3 mb-1">
      <div className="flex-1 min-w-0">
        <div className="text-[14px] text-white/95 mb-0.5">{t.topic || t.title}</div>
        <div className="text-[12px] text-white/55 italic">{t.reasoning}</div>
      </div>
      <div className="shrink-0 text-right">
        <Pill tone={t.keep ? "good" : "bad"}>{t.keep ? "KEEP" : "DROP"}</Pill>
        <div className="text-[11px] text-white/60 mt-1">total <span className="font-mono text-white/90">{t.score}/40</span></div>
      </div>
    </div>
    <div className="text-[11px] text-white/50 flex gap-3 mt-1.5 font-mono">
      <span>depth:{t.breakdown?.depth_potential}</span>
      <span>fit:{t.breakdown?.audience_fit}</span>
      <span>stakes:{t.breakdown?.stakes}</span>
      <span>fresh:{t.breakdown?.not_saturated}</span>
    </div>
  </div>
);

const AngleCandidate = ({ a, score }) => (
  <div className="border border-white/8 rounded-xl p-3 bg-white/[0.02]">
    <div className="flex items-start justify-between gap-3 mb-1.5">
      <div>
        <Pill tone="accent" className="mr-2">{a.kind}</Pill>
        <span className="text-[14px] text-white/95 font-medium">{a.title}</span>
      </div>
      {score && <div className="text-[11px] text-white/70 shrink-0 font-mono">{score.total}/50</div>}
    </div>
    <p className="text-[13px] text-white/70 leading-relaxed mb-1.5">{a.thesis}</p>
    {a.anchor_data_point && (
      <div className="text-[11px] text-emerald-300/80 mb-1"><span className="text-white/40">anchor:</span> {a.anchor_data_point}</div>
    )}
    {a.why_this_reader && (
      <div className="text-[11px] text-fuchsia-300/80 italic">✦ {a.why_this_reader}</div>
    )}
    {score && (
      <div className="text-[10px] text-white/45 flex gap-2 mt-2 font-mono flex-wrap">
        <span>surprise:{score.surprise_density}</span>
        <span>non-obv:{score.non_obviousness}</span>
        <span>mech:{score.mechanism_not_headline}</span>
        <span>tension:{score.narrative_tension}</span>
        <span>runway:{score.depth_runway}</span>
      </div>
    )}
    {score?.one_line_note && (
      <div className="text-[11px] text-white/50 italic mt-1.5">"{score.one_line_note}"</div>
    )}
  </div>
);

const CardRow = ({ c, i }) => (
  <div className="border-l-2 border-fuchsia-500/40 pl-3 py-2">
    <div className="text-[10px] font-mono text-white/40 mb-0.5">card {i + 1}</div>
    <div className="text-[14px] text-white/95 font-medium mb-1">{c.headline}</div>
    <div className="text-[13px] text-white/70 leading-relaxed">{c.text}</div>
  </div>
);

// ── Topic trace (the deep dive per topic) ─────────────────────────────────
const TopicTrace = ({ t, publishedCards }) => {
  const [open, setOpen] = useState(false);
  const outcome = t.outcome;
  const router = t.stages?.router;
  const ideation = t.stages?.ideation;
  const writer = t.stages?.writer;
  const chief = t.stages?.chief_v2 || t.stages?.chief_v1;

  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden bg-white/[0.015]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03] transition text-left"
        data-testid={`topic-trace-toggle-${t.topic?.slice(0, 20)}`}
      >
        <div className="flex-1 min-w-0">
          <div className="text-[15px] text-white/95 truncate">{t.topic}</div>
          <div className="text-[11px] text-white/50 mt-0.5 flex flex-wrap gap-2">
            {router && <span>→ {router.persona_label}</span>}
            {ideation?.final_winner && <span className="text-fuchsia-300/70">✦ {ideation.final_winner.title}</span>}
            {ideation?.pipeline === "question_ladder" && <span className="text-emerald-300/70">via question ladder</span>}
            {t.total_elapsed_sec != null && <span className="font-mono">{t.total_elapsed_sec}s</span>}
          </div>
        </div>
        <Pill tone={outcomeTone(outcome)}>{outcome}</Pill>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 space-y-5 border-t border-white/8">
          {/* Router */}
          {router && (
            <div>
              <div className="text-[11px] uppercase text-white/40 mb-1 font-mono tracking-wider">stage 2.5 — persona router</div>
              <div className="text-[13px] text-white/80"><span className="font-mono text-fuchsia-300/80">{router.persona_key}</span> <span className="text-white/40">·</span> {router.persona_label}</div>
              <div className="text-[12px] text-white/60 italic mt-1">{router.why}</div>
            </div>
          )}

          {/* Ideation — either "question_ladder" pipeline OR legacy "attempts" */}
          {ideation?.pipeline === "question_ladder" ? (
            <div>
              <div className="text-[11px] uppercase text-white/40 mb-2 font-mono tracking-wider">
                stage 3 — question ladder
                {ideation.final_winner
                  ? <Pill tone="good" className="ml-2">winner picked</Pill>
                  : <Pill tone="bad" className="ml-2">no winner</Pill>}
              </div>

              {/* Step 1: All questions by lens */}
              {ideation.step_1_question_generation && (
                <div className="mb-4">
                  <div className="text-[11px] text-white/50 mb-2">
                    step 1 · <span className="text-white/80 font-mono">{ideation.step_1_question_generation.total_questions}</span> questions generated across <span className="text-white/80 font-mono">{Object.keys(ideation.step_1_question_generation.questions_by_lens || {}).length}</span> lenses ({ideation.step_1_question_generation.elapsed_sec}s)
                  </div>
                  <div className="grid gap-2">
                    {Object.entries(ideation.step_1_question_generation.questions_by_lens || {}).map(([lens, qs]) => (
                      <div key={lens} className="border border-white/8 rounded-xl p-3 bg-white/[0.015]">
                        <div className="text-[11px] uppercase text-fuchsia-300/70 font-mono tracking-wider mb-1.5">{lens}</div>
                        {qs.map((q, i) => (
                          <div key={i} className="mb-1.5 last:mb-0">
                            <div className="text-[13px] text-white/85">Q: {q.question}</div>
                            {q.curiosity_hook && <div className="text-[11px] text-white/50 italic mt-0.5">✦ {q.curiosity_hook}</div>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Top 5 questions after ranking */}
              {ideation.step_2_question_ranking?.top_5?.length > 0 && (
                <div className="mb-4">
                  <div className="text-[11px] text-white/50 mb-2">
                    step 2 · top 5 questions after ranking ({ideation.step_2_question_ranking.elapsed_sec}s)
                  </div>
                  <div className="space-y-2">
                    {ideation.step_2_question_ranking.top_5.map((q, i) => (
                      <div key={i} className="border border-emerald-500/20 bg-emerald-500/[0.03] rounded-xl p-3">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <div className="flex-1">
                            <Pill tone="good" className="mr-2">#{i + 1}</Pill>
                            <span className="text-[13px] text-white/95">{q.question}</span>
                          </div>
                          <span className="text-[11px] text-white/60 font-mono shrink-0">{q.score}/40</span>
                        </div>
                        <div className="text-[11px] text-white/50 flex flex-wrap gap-2 mt-1">
                          <span className="text-fuchsia-300/70">{q.lens}</span>
                          {q.curiosity_hook && <span className="italic">· {q.curiosity_hook}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: Question → Angle transformation */}
              {ideation.step_3_angle_transform?.angles?.length > 0 && (
                <div className="mb-4">
                  <div className="text-[11px] text-white/50 mb-2">
                    step 3 · questions transformed into angle specs ({ideation.step_3_angle_transform.elapsed_sec}s)
                  </div>
                  <div className="grid gap-2">
                    {ideation.step_3_angle_transform.angles.map((a, i) => {
                      const critScore = ideation.step_4_critic?.scores?.find((s) => s.idx === i);
                      return <AngleCandidate key={i} a={a} score={critScore} />;
                    })}
                  </div>
                </div>
              )}

              {/* Step 4: Critic verdict */}
              {ideation.step_4_critic && (
                <div className="text-[12px] text-white/60">
                  step 4 · critic {ideation.final_winner ? "picked winner" : "rejected"} ({ideation.step_4_critic.elapsed_sec}s)
                </div>
              )}
            </div>
          ) : (
            ideation?.attempts?.map((a, ai) => (
            <div key={ai}>
              <div className="text-[11px] uppercase text-white/40 mb-2 font-mono tracking-wider">
                stage 3+4 — ideator → critic (attempt {a.attempt})
                {a.winner_selected ? <Pill tone="good" className="ml-2">winner picked</Pill> : <Pill tone="warn" className="ml-2">regenerate</Pill>}
              </div>
              <div className="grid gap-2">
                {(a.candidates || []).map((cand, ci) => {
                  const critScore = a.critic?.scores?.find((s) => s.idx === ci);
                  return <AngleCandidate key={ci} a={cand} score={critScore} />;
                })}
              </div>
              {a.critique && !a.winner_selected && (
                <div className="mt-2 text-[12px] text-rose-300/80 italic border-l-2 border-rose-500/40 pl-3">
                  Critic feedback: {a.critique}
                </div>
              )}
            </div>
          ))
          )}

          {/* Writer */}
          {writer && (
            <div>
              <div className="text-[11px] uppercase text-white/40 mb-1 font-mono tracking-wider">stage 5+6 — deep research → card writer</div>
              {writer.research?.attempts?.map((att, i) => (
                <div key={i} className="text-[12px] text-white/60 font-mono">
                  · attempt {i + 1}: is_news={String(att.is_news)}, days={att.news_days}, sources={att.sources}, youtube={att.youtube}, {att.elapsed_sec}s
                </div>
              ))}
              {writer.research?.research_angles?.length > 0 && (
                <div className="text-[12px] text-white/60 mt-1">
                  research angles: <span className="text-white/80">{writer.research.research_angles.join(" · ")}</span>
                </div>
              )}
              {writer.writer && (
                <div className="text-[12px] text-white/70 mt-1">
                  cards produced: <span className="font-mono text-white/95">{writer.writer.cards_produced}</span>
                  {" "}<span className="text-white/40">·</span>{" "}
                  <span className="font-mono">{writer.writer.elapsed_sec}s</span>
                </div>
              )}
            </div>
          )}

          {/* Chief */}
          {chief && (
            <div>
              <div className="text-[11px] uppercase text-white/40 mb-1 font-mono tracking-wider">stage 7 — chief editor</div>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={chief.verdict === "PASS" ? "good" : "bad"}>{chief.verdict}</Pill>
                <span className="text-[12px] text-white/70">aha count: <span className="font-mono text-white/95">{chief.aha_count}</span></span>
                <span className="text-[12px] text-white/70">chained: <span className="font-mono">{String(chief.chained)}</span></span>
                <span className="text-[12px] text-white/70">opens curiosity: <span className="font-mono">{String(chief.opens_curiosity_at_end)}</span></span>
              </div>
              {chief.problem_indices?.length > 0 && (
                <div className="text-[12px] text-amber-300/80 mt-1">problem cards: {chief.problem_indices.join(", ")}</div>
              )}
              {chief.notes && <div className="text-[12px] text-white/60 italic mt-1">"{chief.notes}"</div>}
            </div>
          )}

          {/* Published cards */}
          {outcome === "published" && publishedCards?.length > 0 && (
            <div>
              <div className="text-[11px] uppercase text-white/40 mb-2 font-mono tracking-wider">published — 12 cards</div>
              <div className="space-y-1.5">
                {publishedCards.map((c, i) => <CardRow key={i} c={c} i={i} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Admin page ───────────────────────────────────────────────────────
export default function Admin() {
  const [tab, setTab] = useState("runs");
  const [status, setStatus] = useState(null);
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [runDetail, setRunDetail] = useState(null);
  const [personas, setPersonas] = useState({});
  const [publishedCardsByTopic, setPublishedCardsByTopic] = useState({});
  const [loading, setLoading] = useState(false);

  const refreshAll = async () => {
    try {
      const [s, r, p] = await Promise.all([
        fetchNewsroomStatus(),
        fetchNewsroomRuns(20),
        fetchNewsroomPersonas(),
      ]);
      setStatus(s);
      setRuns(r.runs || []);
      setPersonas(p.personas || {});
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshAll();
    const t = setInterval(refreshAll, 6000); // auto-refresh every 6s
    return () => clearInterval(t);
  }, []);

  const loadRunDetail = async (runId) => {
    setLoading(true);
    setSelectedRun(runId);
    setRunDetail(null);
    try {
      const d = await fetchNewsroomRunDetail(runId);
      setRunDetail(d);
      // Fetch published cards for topics in this run
      const publishedByTopic = {};
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      await Promise.all(
        (d.topics || [])
          .filter((t) => t.outcome === "published" && t.published_id)
          .map(async (t) => {
            try {
              const res = await fetch(`${backendUrl}/api/insights/hot/topic/${t.published_id}`);
              if (res.ok) {
                const data = await res.json();
                publishedByTopic[t.topic] = data.insights || [];
              }
            } catch {}
          })
      );
      setPublishedCardsByTopic(publishedByTopic);
    } catch (e) {
      toast.error("Failed to load run detail");
    } finally {
      setLoading(false);
    }
  };

  const kickRun = async () => {
    try {
      await triggerNewsroomRun(true);
      toast.success("Newsroom run triggered in background");
      setTimeout(refreshAll, 2000);
    } catch (e) {
      toast.error("Failed to trigger run");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0C0C0D] text-[#F8F8F8]">
      {/* Header */}
      <div className="border-b border-white/8 sticky top-0 bg-[#0C0C0D]/95 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-mono">druvinsight</div>
            <h1 className="text-xl font-semibold">Newsroom · Factory Floor</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={kickRun}
              disabled={status?.running}
              className="px-4 py-2 rounded-full bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-200 text-[13px] hover:bg-fuchsia-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition"
              data-testid="trigger-newsroom-run"
            >
              {status?.running ? "running…" : "▶ trigger run"}
            </button>
            <button
              onClick={refreshAll}
              className="px-3 py-2 rounded-full bg-white/8 border border-white/12 text-white/80 text-[13px] hover:bg-white/12 transition"
              data-testid="refresh-admin"
            >
              ⟳
            </button>
          </div>
        </div>

        {/* Status strip */}
        {status && (
          <div className="max-w-6xl mx-auto px-6 pb-4 flex flex-wrap gap-3 text-[12px] text-white/60">
            <span>running: <Pill tone={status.running ? "warn" : "default"}>{String(status.running)}</Pill></span>
            <span>runs recorded: <span className="text-white/90 font-mono">{status.total_runs_recorded}</span></span>
            <span>topics cached: <span className="text-white/90 font-mono">{status.total_topics_cached}</span></span>
            <span>personas: <span className="text-white/90 font-mono">{status.personas_available?.length || 0}</span></span>
          </div>
        )}

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-6 flex gap-1">
          {[
            { k: "runs", label: "runs" },
            { k: "personas", label: "personas" },
            { k: "pipeline", label: "pipeline architecture" },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => { setTab(t.k); setSelectedRun(null); setRunDetail(null); }}
              className={`px-4 py-2 text-[13px] border-b-2 transition ${tab === t.k ? "border-fuchsia-400 text-white" : "border-transparent text-white/50 hover:text-white/80"}`}
              data-testid={`admin-tab-${t.k}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {tab === "runs" && (
          <div className="grid md:grid-cols-[280px_1fr] gap-6">
            {/* Run list */}
            <div>
              <div className="text-[11px] uppercase text-white/40 mb-3 font-mono tracking-wider">recent runs</div>
              <div className="space-y-2">
                {runs.length === 0 && <div className="text-white/50 text-[13px]">No runs yet. Trigger one above.</div>}
                {runs.map((r) => (
                  <button
                    key={r.run_id}
                    onClick={() => loadRunDetail(r.run_id)}
                    className={`w-full text-left border rounded-xl p-3 transition ${selectedRun === r.run_id ? "border-fuchsia-400/40 bg-fuchsia-500/8" : "border-white/8 bg-white/[0.02] hover:bg-white/[0.04]"}`}
                    data-testid={`run-item-${r.run_id}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-mono text-white/50">{new Date(r.started_at).toLocaleString()}</span>
                      <Pill tone={outcomeTone(r.outcome)}>{r.outcome || "?"}</Pill>
                    </div>
                    <div className="text-[12px] text-white/70 flex justify-between font-mono">
                      <span>signals: <span className="text-white/95">{r.summary?.raw_signals ?? "-"}</span></span>
                      <span>kept: <span className="text-white/95">{r.summary?.kept ?? "-"}</span></span>
                      <span>pub: <span className="text-emerald-300">{r.summary?.published ?? 0}</span></span>
                    </div>
                    {r.total_elapsed_sec != null && (
                      <div className="text-[11px] text-white/45 mt-1 font-mono">{r.total_elapsed_sec}s</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Run detail */}
            <div>
              {!selectedRun && <div className="text-white/50 text-[13px]">Select a run on the left to see the factory floor.</div>}
              {loading && <div className="text-white/50 text-[13px]">Loading trace…</div>}
              {runDetail && <RunDetail run={runDetail} publishedCardsByTopic={publishedCardsByTopic} />}
            </div>
          </div>
        )}

        {tab === "personas" && (
          <div className="grid md:grid-cols-2 gap-4">
            {Object.entries(personas).map(([k, p]) => <PersonaBrief key={k} pkey={k} p={p} />)}
          </div>
        )}

        {tab === "pipeline" && <PipelineArchitecture />}
      </div>
    </div>
  );
}

// ── Detail view for a run ─────────────────────────────────────────────────
const RunDetail = ({ run, publishedCardsByTopic }) => {
  const scout = run.stages?.signal_scout;
  const filter = run.stages?.topic_filter;

  return (
    <div className="space-y-8">
      {/* Run header */}
      <div className="border border-white/10 rounded-2xl p-5 bg-white/[0.02]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[11px] uppercase text-white/40 font-mono tracking-wider">run</div>
            <div className="text-[15px] font-mono text-white/80">{run.run_id?.slice(0, 8)}…</div>
          </div>
          <Pill tone={outcomeTone(run.outcome)}>{run.outcome}</Pill>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
          <div>
            <div className="text-white/45">started</div>
            <div className="text-white/85 font-mono text-[11px]">{new Date(run.started_at).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-white/45">total time</div>
            <div className="text-white/85 font-mono">{run.total_elapsed_sec}s</div>
          </div>
          <div>
            <div className="text-white/45">published</div>
            <div className="text-emerald-300 font-mono">{run.published_count ?? 0}</div>
          </div>
          <div>
            <div className="text-white/45">topics processed</div>
            <div className="text-white/85 font-mono">{run.topics?.length || 0}</div>
          </div>
        </div>
      </div>

      {/* Stage 1 */}
      <section>
        <div className="mb-3">
          <div className="text-[11px] uppercase text-white/40 font-mono tracking-wider">stage 1</div>
          <h2 className="text-lg font-semibold">Signal Scout</h2>
        </div>
        {scout && (
          <div className="border border-white/8 rounded-2xl p-5 bg-white/[0.015]">
            <div className="flex flex-wrap gap-4 text-[12px] mb-4">
              <span className="text-white/60">raw sources: <span className="font-mono text-white/95">{JSON.stringify(scout.raw_source_counts)}</span></span>
              <span className="text-white/60">clusters: <span className="font-mono text-white/95">{scout.clusters_formed}</span></span>
              <span className="text-white/60">elapsed: <span className="font-mono">{scout.elapsed_sec}s</span></span>
            </div>
            <div className="text-[11px] uppercase text-white/40 mb-2 font-mono tracking-wider">top signals (post-clustering)</div>
            <div className="max-h-[400px] overflow-auto pr-2">
              {(scout.signals || []).slice(0, 30).map((s, i) => <SignalRow key={i} s={s} />)}
            </div>
          </div>
        )}
      </section>

      {/* Stage 2 */}
      <section>
        <div className="mb-3">
          <div className="text-[11px] uppercase text-white/40 font-mono tracking-wider">stage 2</div>
          <h2 className="text-lg font-semibold">Topic Filter (Managing Editor)</h2>
        </div>
        {filter && (
          <div className="border border-white/8 rounded-2xl p-5 bg-white/[0.015]">
            <div className="flex flex-wrap gap-4 text-[12px] mb-4">
              <span className="text-white/60">scored: <span className="font-mono text-white/95">{filter.scored_count}</span></span>
              <span className="text-white/60">kept ≥28/40: <span className="font-mono text-emerald-300">{filter.kept_count}</span></span>
              <span className="text-white/60">elapsed: <span className="font-mono">{filter.elapsed_sec}s</span></span>
            </div>
            <div className="max-h-[500px] overflow-auto pr-2">
              {(filter.all_scored || []).map((t, i) => <ScoredTopicRow key={i} t={t} />)}
            </div>
          </div>
        )}
      </section>

      {/* Stages 3-7 (per topic) */}
      <section>
        <div className="mb-3">
          <div className="text-[11px] uppercase text-white/40 font-mono tracking-wider">stages 3 → 7</div>
          <h2 className="text-lg font-semibold">Per-topic pipeline</h2>
        </div>
        <div className="space-y-2">
          {(run.topics || []).map((t, i) => (
            <TopicTrace key={i} t={t} publishedCards={publishedCardsByTopic[t.topic]} />
          ))}
        </div>
      </section>
    </div>
  );
};

// ── Pipeline architecture reference ──────────────────────────────────────
const PipelineArchitecture = () => (
  <div className="max-w-3xl">
    <p className="text-[14px] text-white/70 leading-relaxed mb-6">
      The DruvInsight newsroom is a <span className="text-white">7-stage multi-agent pipeline</span> that runs offline
      once every 24 hours. Each stage is a specialized expert agent — grounded in real
      source knowledge, not jargon. The output is repeatable engagement, not lucky content.
    </p>

    {[
      { n: 1, name: "Signal Scout", desc: "Aggregates trending signals from Reddit (15 subreddits), Hacker News top stories, and Tavily news search across 6 topical queries. Clusters cross-source signals to find cultural moments vs blips.", tools: "Reddit JSON, HN Firebase API, Tavily search" },
      { n: 2, name: "Topic Filter (Managing Editor)", desc: "Ex-Economist / Ex-Ken editor persona. Scores each signal 1-10 on depth_potential, audience_fit, stakes, not_saturated. Kills anything below 28/40. Rejects one-sentence stories and personal tragedies without systemic read.", tools: "gpt-5.4-mini" },
      { n: 2.5, name: "Persona Router (Chief Audience Officer)", desc: "Matches each surviving topic to the ONE persona whose reader will find it most engaging. Uses each persona's wow_factors and shareability_triggers as routing signal — not just topic category.", tools: "gpt-5.4-mini" },
      { n: 3, name: "Question Ladder — 10 Specialist Question Agents (parallel)", desc: "Each of 10 specialists asks 3 questions from their lens: Follow-the-Money, Invisible Mechanism, Winners & Losers, Why This Person, Historical Parallel, Precedent Set, Media & Algorithm, Insider Industry, Official vs Actual, Second-Order Future. Together they produce ~30 candidate questions per topic — the kind a curious 25-year-old silently wonders about but never sees asked.", tools: "gpt-5.4-mini × 10 parallel" },
      { n: 3.5, name: "Question Ranker", desc: "Scores each of the ~30 questions on 4 axes: curiosity_gap, shareability, answerability, non_obviousness. Requires diversity across lenses. Picks top 5.", tools: "gpt-5.4" },
      { n: 3.7, name: "Question → Angle Transformer", desc: "Converts each of the top 5 questions into a proper angle spec (kind, title, thesis, anchor, rabbit_hole_potential) so the writer can build 12 cards.", tools: "gpt-5.4" },
      { n: 4, name: "Angle Critic (Hostile Expert Reader)", desc: "Scores each angle on 5 axes (/50): surprise_density, non_obviousness, mechanism_not_headline, narrative_tension, depth_runway. Rejects anything <35/50. If ALL fail, falls back to the legacy single-pass Ideator.", tools: "gpt-5.4" },
      { n: 5, name: "Deep Researcher", desc: "For the winning angle, runs Tavily advanced search + full-content extraction on top 5 sources + YouTube transcript pulls. Falls back to 30-day non-news window if news window is empty.", tools: "Tavily API, YouTube Transcript API" },
      { n: 6, name: "Card Writer", desc: "Writes 12 cards in the persona's voice. Bakes in latent-question chaining (each card ends where the reader is silently forming a question, next card answers it), non-obviousness filter, mechanism-over-headline rule.", tools: "gpt-5.4" },
      { n: 7, name: "Chief Editor", desc: "Reads the 12-card sequence as the reader. Requires aha_count ≥ 4, opens_curiosity_at_end=true, chained=true, every card with a specific number/name. If REJECT, one revision loop, else drop the topic entirely.", tools: "gpt-5.4" },
    ].map((s) => (
      <div key={s.n} className="border border-white/10 rounded-2xl p-5 bg-white/[0.015] mb-3">
        <div className="flex items-baseline gap-3 mb-2">
          <div className="text-[24px] font-bold text-fuchsia-300/40 font-mono">{s.n}</div>
          <h3 className="text-[16px] font-semibold">{s.name}</h3>
        </div>
        <p className="text-[13px] text-white/70 leading-relaxed">{s.desc}</p>
        <div className="text-[11px] text-white/40 mt-2 font-mono">tools: {s.tools}</div>
      </div>
    ))}
  </div>
);
