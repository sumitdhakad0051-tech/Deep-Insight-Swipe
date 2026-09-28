import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Trash, BookmarkSimple } from "@phosphor-icons/react";
import { listSaved, deleteSaved } from "@/lib/api";
import HotHeaderPill from "@/components/HotHeaderPill";

export default function Saved() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  const load = async () => {
    try {
      const data = await listSaved();
      setItems(data);
    } catch {
      toast.error("Could not load saved insights");
      setItems([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id) => {
    try {
      await deleteSaved(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast("Removed");
    } catch {
      toast.error("Could not remove");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0C0C0D] pb-16">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0C0C0D]/85 px-5 py-4 backdrop-blur-xl">
        <button
          data-testid="saved-back"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/80"
          aria-label="Back"
        >
          <ArrowLeft size={16} weight="regular" />
        </button>
        <h1 className="font-editorial text-lg italic text-white">Saved</h1>
        <HotHeaderPill compact />
      </header>

      <main className="mx-auto max-w-2xl px-5 pt-8">
        {items === null && (
          <p className="text-center font-ui text-xs uppercase tracking-[0.28em] text-white/40">
            Loading…
          </p>
        )}

        {items && items.length === 0 && (
          <div className="mt-24 flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
              <BookmarkSimple size={22} weight="regular" className="text-white/50" />
            </div>
            <p className="font-editorial text-xl text-white/85">
              No saved insights yet
            </p>
            <p className="max-w-sm font-ui text-sm text-white/50">
              Bookmark insights during your swipe feed to revisit them anytime.
            </p>
            <button
              data-testid="saved-empty-cta"
              onClick={() => navigate("/")}
              className="mt-3 rounded-full bg-white px-5 py-2.5 font-ui text-xs font-semibold uppercase tracking-[0.16em] text-[#0C0C0D]"
            >
              Discover Insights
            </button>
          </div>
        )}

        {items && items.length > 0 && (
          <ul className="flex flex-col gap-4">
            {items.map((ins, idx) => (
              <motion.li
                key={ins.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.35 }}
                data-testid={`saved-item-${ins.id}`}
                className="group rounded-2xl border border-white/10 bg-[#121214] p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-ui text-[10px] uppercase tracking-[0.24em] text-white/40">
                    {ins.topic}
                  </p>
                  <button
                    data-testid={`remove-${ins.id}`}
                    onClick={() => remove(ins.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/5 hover:text-white/90"
                    aria-label="Remove"
                  >
                    <Trash size={14} weight="regular" />
                  </button>
                </div>
                {ins.headline && (
                  <h3 className="mt-3 font-editorial text-xl leading-snug text-white">
                    {ins.headline}
                  </h3>
                )}
                <p className="mt-2 font-editorial text-base leading-[1.55] text-white/80">
                  {ins.text}
                </p>
                {ins.source_url && (
                  <a
                    href={ins.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-2 font-ui text-[11px] text-white/50 hover:text-white/90"
                  >
                    ↗ {ins.source_title?.slice(0, 60) || "Source"}
                  </a>
                )}
              </motion.li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
