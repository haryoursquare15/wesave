import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Menu, Home, LayoutDashboard, Wallet, PiggyBank, Users, Receipt,
  Target, Gift, Settings, LifeBuoy, Landmark, Sparkles, X,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import vestaraLogo from "@/assets/vestara-logo.jpg";

const sections: { label: string; items: { icon: any; label: string; path: string; comingSoon?: boolean }[] }[] = [
  {
    label: "Main",
    items: [
      { icon: Home, label: "Home", path: "/app" },
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
      { icon: Wallet, label: "Wallet", path: "/wallet" },
    ],
  },
  {
    label: "Save & Invest",
    items: [
      { icon: PiggyBank, label: "My Savings", path: "/app" },
      { icon: Users, label: "Thrift (Ajo)", path: "/groups" },
      { icon: Landmark, label: "Target Ajo", path: "/target-ajo" },
      { icon: Target, label: "Goal Funding", path: "/goal-funding" },
      { icon: Sparkles, label: "Associations", path: "/associations", comingSoon: true },
    ],
  },
  {
    label: "Payments & More",
    items: [
      { icon: Receipt, label: "SplitPay", path: "/split-pay" },
      { icon: Gift, label: "Referrals", path: "/referrals" },
      { icon: Settings, label: "Settings", path: "/settings" },
      { icon: LifeBuoy, label: "Help & Support", path: "/help" },
    ],
  },
];

export function AppMenuDrawer() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="shrink-0" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
          <SheetTitle className="flex items-center justify-between">
            <img src={vestaraLogo} alt="Vestara" className="h-8 w-auto object-contain" />
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-4 w-4" />
            </Button>
          </SheetTitle>
        </SheetHeader>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.path;
                  return (
                    <Link
                      key={item.label}
                      to={item.path}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px]",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-muted/60"
                      )}
                    >
                      <item.icon className={cn("h-4.5 w-4.5 h-[18px] w-[18px]", active ? "text-primary" : "text-muted-foreground")} />
                      <span className="flex-1">{item.label}</span>
                      {item.comingSoon && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gold/15 text-gold">
                          Soon
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
