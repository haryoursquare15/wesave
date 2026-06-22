import { motion } from "framer-motion";
import { CreditCard, Sparkles, ShieldCheck, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import wesaveLogo from "@/assets/vestara-logo.jpg";

/* ─── Virtual Debit — Coming Soon ─── */
export function SandboxCardTab() {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-3 pt-2"
      >
        {/* Stylized card preview with shimmer */}
        <div className="relative w-64 aspect-[1.586/1] mx-auto rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-emerald-800 shadow-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.07] to-transparent" />
          <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-white/[0.05]" />
          <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full bg-white/[0.04]" />

          <div className="absolute top-4 left-4">
            <div className="w-9 h-6 rounded bg-gradient-to-br from-amber-300/80 to-amber-500/60 border border-amber-400/30" />
          </div>
          <div className="absolute top-3 right-4">
            <img src={wesaveLogo} alt="Vestara" className="h-5 brightness-200 opacity-90" />
          </div>
          <div className="absolute bottom-9 left-4 right-4">
            <p className="text-[12px] font-mono text-white/60 tracking-[0.18em]">•••• •••• •••• ••••</p>
          </div>
          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
            <div>
              <p className="text-[7px] uppercase text-white/40 tracking-widest">Expires</p>
              <p className="text-[10px] font-mono text-white/70">••/••</p>
            </div>
            <p className="text-[8px] text-white/40 tracking-wider">VFD MFB</p>
          </div>
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 2.5 }}
          />
        </div>

        <div className="flex justify-center pt-2">
          <Badge variant="secondary" className="gap-1.5 px-3 py-1">
            <Sparkles className="h-3 w-3" />
            Coming soon
          </Badge>
        </div>

        <h2 className="text-xl font-bold text-foreground pt-1">Virtual Debit Card</h2>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          We're putting the finishing touches on your virtual Verve card.
          You'll be able to issue, freeze, and spend straight from your wallet.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-2.5"
      >
        {[
          { icon: CreditCard, text: "Verve virtual debit", sub: "Pay anywhere cards are accepted" },
          { icon: ShieldCheck, text: "Block & unblock instantly", sub: "Stay in control of your card" },
          { icon: KeyRound, text: "Set your own PIN", sub: "Personal 4-digit PIN protection" },
        ].map((f, i) => (
          <div key={i} className="flex items-center gap-3 bg-card rounded-xl border border-border/50 p-3.5 opacity-70">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <f.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{f.text}</p>
              <p className="text-[11px] text-muted-foreground">{f.sub}</p>
            </div>
          </div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center"
      >
        <p className="text-xs text-muted-foreground">
          We'll notify you the moment virtual cards go live in your sandbox. ✨
        </p>
      </motion.div>
    </div>
  );
}
