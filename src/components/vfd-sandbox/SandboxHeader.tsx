import { ArrowLeft, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import vestaraLogo from "@/assets/vestara-logo.jpg";
import { SandboxNotificationBell } from "./SandboxNotificationBell";

export function SandboxHeader() {
  const navigate = useNavigate();

  const handleBack = () => {
    // Keep users within Vestara — go back in history if it's a sandbox route,
    // otherwise land on the sandbox home.
    if (window.history.length > 1) {
      const prev = document.referrer;
      if (!prev || prev.includes(window.location.host)) {
        navigate(-1);
        return;
      }
    }
    navigate("/vfd-sandbox");
  };

  return (
    <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 flex items-center">
          <img
            src={vestaraLogo}
            alt="Vestara — Grow Your Money Smarter"
            className="h-8 w-auto object-contain"
          />
        </div>
        <SandboxNotificationBell />
        <motion.div
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="flex items-center gap-1 px-2 py-1 rounded-full bg-warning/10 border border-warning/30 shrink-0"
        >
          <FlaskConical className="h-3 w-3 text-warning" />
          <span className="text-[10px] font-medium text-warning">Sandbox</span>
        </motion.div>
      </div>
    </div>
  );
}
