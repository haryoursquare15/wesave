import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { generateActivityFeed, type ActivityMessage } from "@/lib/simulatedPoolData";

export function ActivityTicker() {
  const [messages] = useState<ActivityMessage[]>(generateActivityFeed);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const advance = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % messages.length);
  }, [messages.length]);

  useEffect(() => {
    if (isPaused) return;
    intervalRef.current = setInterval(advance, 4000);
    return () => clearInterval(intervalRef.current);
  }, [isPaused, advance]);

  // Touch swipe support
  const touchStart = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) advance();
      else setCurrentIndex((prev) => (prev - 1 + messages.length) % messages.length);
    }
  };

  const current = messages[currentIndex];

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Simulated badge */}
      <div className="absolute top-1 right-2 text-[10px] text-muted-foreground/50 select-none">
        Simulated Activity
      </div>

      <div className="flex items-center gap-3 min-h-[40px]">
        {/* Pulsing dot */}
        <div className="relative flex-shrink-0">
          <span className="flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
          </span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={current.id + currentIndex}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.3 }}
            className="flex-1 min-w-0"
          >
            <p className="text-sm text-foreground truncate">
              <span className="mr-1.5">{current.emoji}</span>
              {current.message}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{current.timeAgo}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1 mt-2">
        {messages.slice(0, 8).map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i)}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === currentIndex % 8 ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
