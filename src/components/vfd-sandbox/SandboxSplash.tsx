import { motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import vestaraIconUrl from "@/assets/vestara-badge.jpg";
const vestaraIcon = { url: vestaraIconUrl };
import { TonalBackground } from "./TonalBackground";

interface SandboxSplashProps {
  onDone?: () => void;
  duration?: number;
}

export function SandboxSplash({ onDone, duration = 2000 }: SandboxSplashProps) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(t);
  }, [onDone, duration]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <TonalBackground variant="splash" />
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative flex flex-col items-center gap-3 px-6"
      >
        <img src={vestaraIcon.url} alt="" width={96} height={96} decoding="async" className="h-24 w-24 object-contain" />
        <h1 className="text-4xl font-semibold tracking-tight text-ink-foreground">Vestara</h1>
        <p className="text-sm text-ink-foreground/60">Grow your money smarter</p>
      </motion.div>
    </motion.div>
  );
}
