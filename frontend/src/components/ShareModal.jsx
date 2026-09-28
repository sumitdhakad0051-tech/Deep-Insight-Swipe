import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, TwitterLogo, DownloadSimple, Copy, Sparkle } from "@phosphor-icons/react";
import { toPng } from "html-to-image";
import { toast } from "sonner";

export default function ShareModal({ open, onClose, insight }) {
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(false);

  if (!insight) return null;

  const captureBlob = async () => {
    const node = cardRef.current;
    if (!node) return null;
    const dataUrl = await toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#0C0C0D",
    });
    const res = await fetch(dataUrl);
    return { blob: await res.blob(), dataUrl };
  };

  const shareToTwitter = async () => {
    setBusy(true);
    try {
      const { blob } = await captureBlob();
      const file = new File([blob], "insight.png", { type: "image/png" });
      const text = `${insight.headline || "Just discovered this"} — via Insight Swipe`;

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          text,
          files: [file],
        });
      } else {
        const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
          text
        )}`;
        window.open(intent, "_blank", "noopener,noreferrer");
        toast("Image ready — download & attach to your post", {
          description: "Native share not available in this browser.",
        });
        // Also offer download
        await downloadImage();
      }
    } catch (e) {
      toast.error("Could not share");
    } finally {
      setBusy(false);
    }
  };

  const downloadImage = async () => {
    setBusy(true);
    try {
      const { dataUrl } = await captureBlob();
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `insight-swipe-${insight.id.slice(0, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Image downloaded");
    } catch {
      toast.error("Download failed");
    } finally {
      setBusy(false);
    }
  };

  const copyText = async () => {
    try {
      const text = `${insight.headline ? insight.headline + "\n\n" : ""}${insight.text}${insight.source_url ? "\n\n" + insight.source_url : ""}\n\n— via Insight Swipe`;
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#0F0F11] pb-8"
            data-testid="share-modal"
          >
            <div className="flex justify-center pt-3">
              <div className="h-1 w-10 rounded-full bg-white/15" />
            </div>

            <div className="flex items-center justify-between px-5 pb-4 pt-3">
              <p className="font-ui text-[10px] uppercase tracking-[0.28em] text-white/40">
                Share this insight
              </p>
              <button
                data-testid="share-close"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/80"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Preview card */}
            <div className="px-5">
              <div
                ref={cardRef}
                data-testid="share-card"
                className="relative mx-auto w-full max-w-[520px] overflow-hidden rounded-3xl border border-white/10 p-8"
                style={{
                  background:
                    "radial-gradient(120% 100% at 0% 0%, #1B1B1E 0%, #0C0C0D 55%, #0C0C0D 100%)",
                  aspectRatio: "1 / 1",
                }}
              >
                <div className="flex items-center gap-2">
                  <Sparkle weight="fill" size={16} className="text-white" />
                  <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.24em] text-white/80">
                    Insight&nbsp;Swipe
                  </span>
                </div>

                <p className="mt-4 font-ui text-[9px] uppercase tracking-[0.3em] text-white/40">
                  {insight.topic}
                </p>

                {insight.headline && (
                  <h3 className="mt-3 font-editorial text-2xl leading-tight text-white">
                    {insight.headline}
                  </h3>
                )}
                <p
                  className="mt-4 font-editorial leading-[1.5] text-white/90"
                  style={{ fontSize: insight.text.length > 320 ? "14px" : "16px" }}
                >
                  {insight.text}
                </p>

                <div className="absolute inset-x-8 bottom-8 flex items-center justify-between border-t border-white/10 pt-4">
                  <span className="font-editorial text-xs italic text-white/50">
                    "I never knew that."
                  </span>
                  <span className="font-ui text-[9px] uppercase tracking-[0.28em] text-white/40">
                    insight-swipe
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 space-y-2 px-5">
              <button
                data-testid="share-twitter"
                onClick={shareToTwitter}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3.5 font-ui text-sm font-semibold uppercase tracking-[0.14em] text-[#0C0C0D] transition-opacity disabled:opacity-40"
              >
                <TwitterLogo size={16} weight="fill" />
                Share to X / Twitter
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  data-testid="share-download"
                  onClick={downloadImage}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 font-ui text-xs uppercase tracking-[0.14em] text-white/85"
                >
                  <DownloadSimple size={14} />
                  Save Image
                </button>
                <button
                  data-testid="share-copy"
                  onClick={copyText}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 font-ui text-xs uppercase tracking-[0.14em] text-white/85"
                >
                  <Copy size={14} />
                  Copy Text
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
