import { motion } from "framer-motion";
import { useEffect } from "react";
import vestaraLogo from "@/assets/vestara-logo.jpg";

interface SandboxSplashProps {
  onDone?: () => void;
  duration?: number;
}

export function SandboxSplash({ onDone, duration = 2600 }: SandboxSplashProps) {
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(t);
  }, [onDone, duration]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      className="fixed inset-0 z-[100] overflow-hidden flex items-center justify-center"
      style={{
        background:
          "radial-gradient(120% 80% at 20% 10%, hsl(265 85% 25%) 0%, transparent 60%)," +
          "radial-gradient(120% 80% at 90% 90%, hsl(195 95% 35%) 0%, transparent 55%)," +
          "linear-gradient(135deg, hsl(245 70% 12%) 0%, hsl(220 60% 8%) 100%)",
      }}
    >
      {/* Floating orbs */}
      {[
        { c: "hsl(280 90% 60% / 0.35)", s: 360, x: "-20%", y: "-15%", d: 0 },
        { c: "hsl(190 95% 55% / 0.30)", s: 280, x: "70%", y: "60%", d: 0.4 },
        { c: "hsl(160 85% 55% / 0.25)", s: 220, x: "10%", y: "70%", d: 0.8 },
        { c: "hsl(45 95% 60% / 0.20)", s: 180, x: "75%", y: "-10%", d: 1.2 },
      ].map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-3xl"
          style={{
            width: o.s,
            height: o.s,
            left: o.x,
            top: o.y,
            background: o.c,
          }}
          animate={{
            x: [0, 40, -20, 0],
            y: [0, -30, 20, 0],
            scale: [1, 1.15, 0.95, 1],
          }}
          transition={{
            duration: 6,
            delay: o.d,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Grid shimmer */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(0 0% 100%) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100%) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative flex flex-col items-center gap-6 px-6">
        {/* Logo with halo */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <motion.div
            className="absolute inset-0 rounded-3xl blur-2xl"
            style={{
              background:
                "conic-gradient(from 0deg, hsl(280 95% 65%), hsl(195 95% 55%), hsl(160 90% 55%), hsl(45 95% 60%), hsl(280 95% 65%))",
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />
          <motion.img
            src={vestaraLogo}
            alt="Vestara"
            className="relative h-28 w-28 rounded-3xl object-cover shadow-2xl ring-1 ring-white/20"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>

        {/* Wordmark — letters cascade in */}
        <div className="flex items-center overflow-hidden">
          {"Vestara".split("").map((ch, i) => (
            <motion.span
              key={i}
              initial={{ y: 40, opacity: 0, filter: "blur(8px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              transition={{
                delay: 0.6 + i * 0.07,
                duration: 0.55,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="text-5xl md:text-6xl font-bold tracking-tight"
              style={{
                background:
                  "linear-gradient(135deg, hsl(0 0% 100%) 0%, hsl(195 95% 80%) 50%, hsl(280 90% 80%) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {ch}
            </motion.span>
          ))}
        </div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.3, duration: 0.6 }}
          className="text-sm md:text-base text-white/70 tracking-wide"
        >
          Grow your money smarter
        </motion.p>

        {/* Loading bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="mt-4 h-1 w-40 overflow-hidden rounded-full bg-white/10"
        >
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            className="h-full w-1/2 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, transparent, hsl(195 95% 70%), hsl(280 95% 75%), transparent)",
            }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
