import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, DownloadSimple } from "@phosphor-icons/react";

/**
 * PWA install prompt banner. Captures `beforeinstallprompt` and shows a small
 * dismissible pill above the top bar. Uses localStorage to avoid nagging users.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissedAt = localStorage.getItem("is-install-dismissed");
    if (dismissedAt) {
      const ageDays =
        (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (ageDays < 14) return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!visible) return null;

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    localStorage.setItem("is-install-dismissed", String(Date.now()));
    setVisible(false);
  };

  const dismiss = () => {
    localStorage.setItem("is-install-dismissed", String(Date.now()));
    setVisible(false);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-x-0 top-0 z-50 flex justify-center pt-3"
        data-testid="install-prompt"
      >
        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-[#121214]/90 py-1.5 pl-4 pr-1.5 backdrop-blur-xl">
          <span className="font-ui text-[11px] text-white/80">
            Install Insight Swipe
          </span>
          <button
            data-testid="install-btn"
            onClick={install}
            className="flex items-center gap-1 rounded-full bg-white px-3 py-1 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0C0C0D]"
          >
            <DownloadSimple size={11} weight="bold" />
            Install
          </button>
          <button
            data-testid="install-dismiss"
            onClick={dismiss}
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/50 hover:text-white/90"
            aria-label="Dismiss"
          >
            <X size={11} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
