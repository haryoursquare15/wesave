import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, Unlock, ShieldCheck, Timer, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSpendLock, type SpendLockPeriod, type SpendLockUnlockMode } from "@/hooks/useSpendLock";
import { useSpendLockInsights } from "@/hooks/useSpendLockInsights";

const naira = (n: number) =>
  `₦${Number(n || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function SpendLockCard() {
  const { status, loading, setRule, pause, resume, removeRule, requestUnlock, cancelUnlock } =
    useSpendLock();
  const { insights } = useSpendLockInsights();
  const pendingSuggestion = (insights?.suggestions ?? []).find(
    (s) => s.suggestion_type === "set_limit" || s.suggestion_type === "adjust_limit"
  );
  const suggested = Number(pendingSuggestion?.payload?.suggested_limit || 0);
  const suggestedPeriod = pendingSuggestion?.payload?.period_type ?? null;


  const [setupOpen, setSetupOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);

  const rule = status?.rule ?? null;
  const [periodType, setPeriodType] = useState<SpendLockPeriod>("monthly");
  const [amount, setAmount] = useState("");
  const [resetDay, setResetDay] = useState("1");
  const [unlockMode, setUnlockMode] = useState<SpendLockUnlockMode>("instant");
  const [unlockAmount, setUnlockAmount] = useState("");
  const [unlockReason, setUnlockReason] = useState("");

  const openSetup = () => {
    if (rule) {
      setPeriodType(rule.period_type);
      setAmount(String(rule.limit_amount));
      setResetDay(String(rule.reset_day ?? 1));
      setUnlockMode(rule.unlock_mode);
    }
    setSetupOpen(true);
  };

  const saveRule = async () => {
    const value = Number(amount);
    if (!value || value <= 0) return;
    const day = periodType === "daily" ? null : Number(resetDay) || 1;
    const saved = await setRule(periodType, value, day, unlockMode, 30);
    if (saved) setSetupOpen(false);
  };

  const submitUnlock = async () => {
    const value = Number(unlockAmount);
    if (!value || value <= 0) return;
    const saved = await requestUnlock(value, unlockReason || undefined);
    if (saved) {
      setUnlockOpen(false);
      setUnlockAmount("");
      setUnlockReason("");
    }
  };

  const setupDialog = (
    <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set your SpendLock</DialogTitle>
          <DialogDescription>
            Choose how much you want to allow yourself to spend. Nothing is blocked — we simply show
            you what is left.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Spending window</Label>
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as SpendLockPeriod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Every day</SelectItem>
                <SelectItem value="weekly">Every week</SelectItem>
                <SelectItem value="monthly">Every month</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="spendlock-amount">Limit amount (₦)</Label>
            <Input
              id="spendlock-amount"
              inputMode="numeric"
              placeholder="50000"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            />
            {suggested > 0 && Number(amount) !== suggested && (
              <button
                type="button"
                onClick={() => {
                  setAmount(String(suggested));
                  if (suggestedPeriod) setPeriodType(suggestedPeriod);
                }}
                className="text-[11px] text-primary underline underline-offset-2"
              >
                Suggested for you: {naira(suggested)}
                {suggestedPeriod
                  ? suggestedPeriod === "daily"
                    ? " a day"
                    : suggestedPeriod === "monthly"
                    ? " a month"
                    : " a week"
                  : ""}
              </button>
            )}
          </div>

          {periodType === "weekly" && (
            <div className="space-y-1.5">
              <Label>Restarts on</Label>
              <Select value={resetDay} onValueChange={setResetDay}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d, i) => (
                    <SelectItem key={d} value={String(i + 1)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {periodType === "monthly" && (
            <div className="space-y-1.5">
              <Label htmlFor="spendlock-reset">Restarts on day of month (1–28)</Label>
              <Input
                id="spendlock-reset"
                inputMode="numeric"
                value={resetDay}
                onChange={(e) => setResetDay(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>When you want to spend past your limit</Label>
            <Select value={unlockMode} onValueChange={(v) => setUnlockMode(v as SpendLockUnlockMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="instant">Allow it straight away</SelectItem>
                <SelectItem value="cooling_off">Make me wait 30 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-1">
            <Button className="flex-1 min-h-[44px]" onClick={saveRule} disabled={loading}>
              {rule ? "Update SpendLock" : "Turn on SpendLock"}
            </Button>
            {rule && (
              <Button
                variant="outline"
                className="min-h-[44px]"
                onClick={async () => {
                  await removeRule();
                  setSetupOpen(false);
                }}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (!rule) {
    return (
      <>
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={openSetup}
          className="w-full h-full min-h-[176px] flex flex-col items-start justify-between overflow-hidden rounded-lg border border-[hsl(var(--spendlock-border))] bg-[hsl(var(--spendlock-surface))] px-3.5 py-3 text-left text-[hsl(var(--spendlock-foreground))] shadow-glow active:scale-[0.99]"
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold">Set your SpendLock</p>
              <p className="text-[11px] text-[hsl(var(--spendlock-muted))]">
                Give yourself a spending limit and track what is left
              </p>
            </div>
          </div>
          <Pencil className="h-4 w-4 text-[hsl(var(--spendlock-muted))]" />
        </motion.button>
        {setupDialog}
      </>
    );
  }

  const limit = Number(status?.period?.limit_amount ?? rule.limit_amount);
  const unlocked = Number(status?.unlocked_amount ?? 0);
  const spent = Number(status?.spent_amount ?? 0);
  const remaining = Number(status?.disposable_remaining ?? Math.max(limit + unlocked - spent, 0));
  const allowance = limit + unlocked;
  const pct = allowance > 0 ? Math.min((spent / allowance) * 100, 100) : 0;
  const pending = status?.pending_unlocks ?? [];
  const paused = rule.status === "paused";
  const periodLabel =
    rule.period_type === "daily" ? "today" : rule.period_type === "weekly" ? "this week" : "this month";

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full h-full min-h-[176px] overflow-hidden rounded-lg border border-[hsl(var(--spendlock-border))] bg-[hsl(var(--spendlock-surface))] px-3.5 py-3 text-[hsl(var(--spendlock-foreground))] shadow-glow space-y-2.5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase text-[hsl(var(--spendlock-muted))] flex items-center gap-1.5">
              <Lock className="h-3 w-3" /> Disposable {periodLabel}
            </p>
            <p className="text-2xl font-extrabold leading-tight">{naira(remaining)}</p>
            <p className="text-[10px] text-[hsl(var(--spendlock-muted))]">
              {naira(spent)} spent of {naira(allowance)}
              {paused && " · paused"}
            </p>
          </div>
          <button
            onClick={openSetup}
            className="p-2 -m-1 text-[hsl(var(--spendlock-muted))] hover:text-[hsl(var(--spendlock-foreground))]"
            aria-label="Edit SpendLock"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        <Progress value={pct} className="h-1.5 bg-[hsl(var(--spendlock-surface-soft))]" />

        {pending.length > 0 && (
          <div className="space-y-1">
            {pending.map((u) => (
              <div key={u.id} className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Timer className="h-3 w-3" />
                  {naira(u.amount)} extra unlocks{" "}
                  {u.cooling_off_expires_at
                    ? new Date(u.cooling_off_expires_at).toLocaleTimeString("en-NG", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "shortly"}
                </span>
                <button className="underline" onClick={() => cancelUnlock(u.id)}>
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 min-h-[40px] border-[hsl(var(--spendlock-border))] bg-transparent text-[hsl(var(--spendlock-foreground))] hover:bg-[hsl(var(--spendlock-surface-soft))]">
                <Unlock className="h-3.5 w-3.5 mr-1.5" /> Give myself more
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Add to this {rule.period_type === "daily" ? "day" : rule.period_type === "weekly" ? "week" : "month"}</DialogTitle>
                <DialogDescription>
                  {rule.unlock_mode === "cooling_off"
                    ? "You chose to wait 30 minutes before extra spending room opens."
                    : "This is added to your limit straight away."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="spendlock-extra">Extra amount (₦)</Label>
                  <Input
                    id="spendlock-extra"
                    inputMode="numeric"
                    value={unlockAmount}
                    onChange={(e) => setUnlockAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="spendlock-reason">Why? (optional)</Label>
                  <Input
                    id="spendlock-reason"
                    value={unlockReason}
                    onChange={(e) => setUnlockReason(e.target.value)}
                    placeholder="Car repair"
                  />
                </div>
                <Button className="w-full min-h-[44px]" onClick={submitUnlock} disabled={loading}>
                  Confirm
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            variant="ghost"
            size="sm"
            className="min-h-[40px] text-[hsl(var(--spendlock-muted))] hover:bg-[hsl(var(--spendlock-surface-soft))] hover:text-[hsl(var(--spendlock-foreground))]"
            onClick={() => (paused ? resume() : pause())}
            disabled={loading}
          >
            {paused ? "Resume" : "Pause"}
          </Button>
        </div>
      </motion.div>
      {setupDialog}
    </>
  );
}
