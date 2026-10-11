import { motion } from "framer-motion";
import { useEffect } from "react";
import vestaraIcon from "@/assets/vestara-v.png.asset.json";

interface SandboxSplashProps {
  onDone?: () => void;
  duration?: number;
}

export function SandboxSplash({ onDone, duration = 2200 }: SandboxSplashProps) {
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(t);
  }, [onDone, duration]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex flex-col items-center gap-4 px-6"
      >
        <img
          src={vestaraIcon.url}
          alt="Vestara"
          width={112}
          height={112}
          className="h-28 w-28 rounded-3xl object-contain"
        />
        <h1 className="text-4xl font-semibold tracking-tight text-ink-foreground">Vestara</h1>
        <p className="text-sm text-ink-foreground/70">Grow your money smarter</p>
      </motion.div>
    </motion.div>
  );
}
