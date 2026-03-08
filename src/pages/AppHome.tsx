import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Shield, Users, Zap, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import wesaveLogo from "@/assets/wesave-logo-new.png";

const slides = [
  {
    icon: Users,
    title: "Save Together",
    description: "Join trusted rotating savings groups with friends, family, or colleagues.",
    gradient: "from-primary to-primary/70",
  },
  {
    icon: Zap,
    title: "Automated Payouts",
    description: "Contributions are collected and paid out automatically — no chasing anyone.",
    gradient: "from-secondary to-secondary/70",
  },
  {
    icon: Shield,
    title: "Fully Secured",
    description: "Bank-grade encryption, BVN verification, and real-time transaction tracking.",
    gradient: "from-gold to-gold/70",
  },
  {
    icon: TrendingUp,
    title: "Build Your Future",
    description: "Track your credit score, set savings goals, and grow your financial portfolio.",
    gradient: "from-primary to-secondary",
  },
];

export default function AppHome() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showSplash, setShowSplash] = useState(true);

  // Splash screen timer
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  // Auto-advance slides
  useEffect(() => {
    if (showSplash) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev < slides.length - 1 ? prev + 1 : prev));
    }, 4000);
    return () => clearInterval(interval);
  }, [showSplash]);

  const goToSlide = useCallback((index: number) => setCurrentSlide(index), []);

  const handleGetStarted = () => {
    window.location.href = "https://app.wesave.ng/auth?mode=signup";
  };

  const handleSignIn = () => {
    window.location.href = "https://app.wesave.ng/auth";
  };

  // Splash Screen
  if (showSplash) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center gap-6"
        >
          <motion.img
            src={wesaveLogo}
            alt="WeSave"
            className="h-24 w-auto rounded-2xl shadow-xl"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-center"
          >
            <h1 className="text-3xl font-bold text-primary-foreground">WeSave</h1>
            <p className="text-primary-foreground/70 text-sm mt-1">Save Together, Grow Together</p>
          </motion.div>
          {/* Loading indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex gap-1.5 mt-4"
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-primary-foreground/60"
                animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </motion.div>
        </motion.div>
      </div>
    );
  }

  const slide = slides[currentSlide];
  const isLastSlide = currentSlide === slides.length - 1;

  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden safe-bottom">
      {/* Skip / Sign In */}
      <div className="flex justify-end p-4 pt-[env(safe-area-inset-top,16px)]">
        <button
          onClick={handleSignIn}
          className="text-sm font-medium text-muted-foreground min-h-[44px] min-w-[44px] px-3 flex items-center"
        >
          Sign In
        </button>
      </div>

      {/* Slide Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col items-center text-center max-w-sm"
          >
            {/* Icon circle */}
            <div className={`w-28 h-28 rounded-full bg-gradient-to-br ${slide.gradient} flex items-center justify-center mb-8 shadow-glow`}>
              <slide.icon className="h-14 w-14 text-primary-foreground" />
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-3">
              {slide.title}
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              {slide.description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Controls */}
      <div className="px-8 pb-8 flex flex-col items-center gap-6">
        {/* Dots */}
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i)}
              className={`h-2 rounded-full transition-all duration-300 min-h-[8px] min-w-[8px] ${
                i === currentSlide
                  ? "w-8 bg-primary"
                  : "w-2 bg-border"
              }`}
            />
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="w-full max-w-sm flex flex-col gap-3">
          <Button
            variant="hero"
            size="xl"
            className="w-full"
            onClick={isLastSlide ? handleGetStarted : () => setCurrentSlide((p) => p + 1)}
          >
            {isLastSlide ? "Get Started" : "Next"}
            <ArrowRight className="h-5 w-5" />
          </Button>

          {!isLastSlide && (
            <button
              onClick={() => setCurrentSlide(slides.length - 1)}
              className="text-sm text-muted-foreground font-medium min-h-[44px]"
            >
              Skip
            </button>
          )}

          {isLastSlide && (
            <button
              onClick={handleSignIn}
              className="text-sm text-primary font-medium min-h-[44px]"
            >
              Already have an account? Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
