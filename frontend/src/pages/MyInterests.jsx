import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, X, Trash, ArrowRight } from "@phosphor-icons/react";
import {
  fetchMyInterests,
  saveMyInterests,
  deleteMyInterests,
  getDeviceId,
} from "@/lib/api";
import { MYINT } from "@/constants/testIds";
import { synthesizeTopicFromInterests } from "@/lib/topic";
import HotHeaderPill from "@/components/HotHeaderPill";

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export default function MyInterests() {
  const navigate = useNavigate();
  const [interests, setInterests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newInt, setNewInt] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchMyInterests(getDeviceId());
        setInterests(data.interests || []);
      } catch (e) {
        toast.error("Couldn't load interests");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = async (next) => {
    setInterests(next);
    try {
      await saveMyInterests(getDeviceId(), next);
    } catch {
      toast.error("Couldn't save");
    }
  };

  const remove = (i) => {
    persist(interests.filter((_, idx) => idx !== i));
    toast.message("Removed");
  };

  const add = () => {
    const v = newInt.trim();
    if (!v) return;
    if (interests.some((x) => x.toLowerCase() === v.toLowerCase())) {
      toast.message("Already in your list");
      return;
    }
    persist([...interests, v]);
    setNewInt("");
    toast.success("Added");
  };

  const clearAll = async () => {
    setInterests([]);
    try {
      await deleteMyInterests(getDeviceId());
      toast.message("Cleared all");
    } catch {}
  };

  const proceed = () => {
    if (interests.length === 0) return;
    const topic = synthesizeTopicFromInterests(interests);
    navigate("/directions", { state: { topic, interests } });
  };

  return (
    <div
      data-testid={MYINT.page}
      className="min-h-[100dvh] w-full bg-[#0C0C0D] text-[#F8F8F8]"
    >
      <header
        className="flex items-center justify-between px-5 pt-5 sm:px-6 sm:pt-6"
        style={{ fontFamily: SANS }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-white/80"
          aria-label="Back"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <HotHeaderPill compact />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
        <div
          className="text-[10px] uppercase tracking-[0.28em] text-white/40"
          style={{ fontFamily: SANS }}
        >
          Archive
        </div>
        <h1
          className="mt-2 text-4xl leading-tight sm:text-5xl"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          My Interests.
        </h1>
        <p
          className="mt-3 max-w-md text-sm text-white/55"
          style={{ fontFamily: SANS }}
        >
          Curate the topics that shape your feed. Add, remove, or start over.
        </p>

        {/* Add input */}
        <div className="mt-8 flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] pl-4 pr-1.5 py-1 focus-within:border-white/50">
          <input
            type="text"
            value={newInt}
            onChange={(e) => setNewInt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Add a new interest…"
            data-testid={MYINT.addInput}
            style={{ fontFamily: SANS, fontSize: 14 }}
            className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none"
          />
          <button
            onClick={add}
            data-testid={MYINT.addBtn}
            style={{ fontFamily: SANS }}
            className="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0C0C0D]"
          >
            <Plus size={12} weight="bold" /> Add
          </button>
        </div>

        {loading ? (
          <div className="mt-8 text-sm text-white/50">Loading…</div>
        ) : interests.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif" }} className="text-2xl">
              No interests yet.
            </div>
            <p style={{ fontFamily: SANS }} className="mt-2 text-sm text-white/55">
              Head back home and pick a few topics — this shelf will fill itself.
            </p>
            <button
              onClick={() => navigate("/")}
              style={{ fontFamily: SANS }}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#0C0C0D]"
            >
              Start curating <ArrowRight size={12} weight="bold" />
            </button>
          </div>
        ) : (
          <>
            <ul data-testid={MYINT.list} className="mt-8 flex flex-wrap gap-2">
              <AnimatePresence>
                {interests.map((it, i) => (
                  <motion.li
                    key={it + i}
                    data-testid={MYINT.item(i)}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.18 }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] pl-4 pr-1.5 py-1.5"
                  >
                    <span
                      className="text-sm text-white/85"
                      style={{ fontFamily: SANS }}
                    >
                      {it}
                    </span>
                    <button
                      onClick={() => remove(i)}
                      data-testid={MYINT.remove(i)}
                      aria-label={`Remove ${it}`}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-white/55 hover:bg-white/10 hover:text-white"
                    >
                      <X size={12} weight="bold" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>

            <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6">
              <button
                onClick={clearAll}
                data-testid={MYINT.clearAll}
                style={{ fontFamily: SANS }}
                className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white/95"
              >
                <Trash size={12} /> Clear all
              </button>
              <button
                onClick={proceed}
                data-testid={MYINT.useInFeed}
                style={{ fontFamily: SANS }}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#0C0C0D]"
              >
                Use in feed <ArrowRight size={12} weight="bold" />
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
