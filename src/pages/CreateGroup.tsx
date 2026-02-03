import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Coins, Info, Check, UserPlus, Calendar, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { BottomNav } from "@/components/BottomNav";
import { useCreateGroup } from "@/hooks/useThriftGroups";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { AddMembersDialog } from "@/components/AddMembersDialog";
import { supabase } from "@/integrations/supabase/client";

const daysOfWeek = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

// Generate time slots with 30-minute intervals (48 slots total)
const timeSlots = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = (i % 2) * 30;
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const amPm = hour < 12 ? "AM" : "PM";
  return {
    value: i, // 0-47 representing each 30-min slot
    hour,
    minute,
    label: `${displayHour}:${minute === 0 ? "00" : "30"} ${amPm}`,
  };
});

const daysOfMonth = Array.from({ length: 28 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}${["st", "nd", "rd"][i] || "th"}`,
}));

export default function CreateGroup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { createGroup, loading: isLoading } = useCreateGroup();
  const [createdGroup, setCreatedGroup] = useState<{ id: string; name: string } | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    maxMembers: 5,
    contributionAmount: 10000,
    period: "weekly" as "daily" | "weekly" | "monthly",
    autoDebit: true,
    contributionTimeSlot: 18, // Default 9:00 AM (slot 18 = 9*2)
    contributionDayOfWeek: 1,
    contributionDayOfMonth: 1,
  });

  const handleCreate = async () => {
    // Use session as the source of truth (AuthContext can be briefly stale).
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      toast.error("Your session has expired. Please sign in again.");
      navigate("/auth");
      return;
    }

    if (!formData.name.trim()) {
      toast.error("Please enter a group name");
      return;
    }

    try {
      // Convert time slot to hour and minute
      const selectedSlot = timeSlots[formData.contributionTimeSlot];
      const group = await createGroup({
        name: formData.name,
        maxMembers: formData.maxMembers,
        contributionAmount: formData.contributionAmount,
        period: formData.period,
        autoDebit: formData.autoDebit,
        contributionHour: selectedSlot?.hour ?? 9,
        contributionMinute: selectedSlot?.minute ?? 0,
        contributionDayOfWeek: formData.contributionDayOfWeek,
        contributionDayOfMonth: formData.contributionDayOfMonth,
      });
      
      setCreatedGroup({ id: group.id, name: group.name });
      toast.success("Thrift group created successfully!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create group. Please try again.";
      toast.error(message);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-NG").format(amount);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="h-10 w-10 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-foreground">Create Thrift Group</h1>
              <p className="text-sm text-muted-foreground">Set up your new savings group</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-lg">
        {/* Group Name */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <Label htmlFor="name">Group Name</Label>
          <Input
            id="name"
            placeholder="e.g., Family Savings Circle"
            className="h-12"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </motion.div>

        {/* Max Members */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <Label>Maximum Members</Label>
            <span className="text-lg font-semibold text-primary">
              {formData.maxMembers}
            </span>
          </div>
          <Slider
            value={[formData.maxMembers]}
            onValueChange={(value) =>
              setFormData({ ...formData, maxMembers: value[0] })
            }
            min={3}
            max={20}
            step={1}
            className="py-4"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>3 members</span>
            <span>20 members</span>
          </div>
        </motion.div>

        {/* Contribution Amount */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <Label>Contribution Amount</Label>
            <span className="text-lg font-semibold text-primary">
              ₦{formatAmount(formData.contributionAmount)}
            </span>
          </div>
          <Slider
            value={[formData.contributionAmount]}
            onValueChange={(value) =>
              setFormData({ ...formData, contributionAmount: value[0] })
            }
            min={5000}
            max={500000}
            step={5000}
            className="py-4"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>₦5,000</span>
            <span>₦500,000</span>
          </div>
        </motion.div>

        {/* Period */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-2"
        >
          <Label>Contribution Period</Label>
          <Select
            value={formData.period}
            onValueChange={(value: "daily" | "weekly" | "monthly") => setFormData({ ...formData, period: value })}
          >
            <SelectTrigger className="h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </motion.div>

        {/* Auto Debit */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex items-center justify-between p-4 rounded-xl bg-card border border-border"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Coins className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Enable Auto-Debit</p>
              <p className="text-xs text-muted-foreground">
                Automatically collect contributions on schedule
              </p>
            </div>
          </div>
          <Switch
            checked={formData.autoDebit}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, autoDebit: checked })
            }
          />
        </motion.div>

        {/* Contribution Schedule */}
        {formData.autoDebit && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="space-y-4 p-4 rounded-xl bg-card border border-border"
          >
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-5 w-5 text-primary" />
              <h3 className="font-medium">Auto-Contribution Schedule</h3>
            </div>

            {formData.period === "daily" && (
              <div className="space-y-2">
                <Label>Contribution Time</Label>
                <Select
                  value={String(formData.contributionTimeSlot)}
                  onValueChange={(value) => setFormData({ ...formData, contributionTimeSlot: Number(value) })}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map((slot) => (
                      <SelectItem key={slot.value} value={String(slot.value)}>
                        {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.period === "weekly" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Day of Week</Label>
                  <Select
                    value={String(formData.contributionDayOfWeek)}
                    onValueChange={(value) => setFormData({ ...formData, contributionDayOfWeek: Number(value) })}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {daysOfWeek.map((day) => (
                        <SelectItem key={day.value} value={String(day.value)}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Contribution Time</Label>
                  <Select
                    value={String(formData.contributionTimeSlot)}
                    onValueChange={(value) => setFormData({ ...formData, contributionTimeSlot: Number(value) })}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots.map((slot) => (
                        <SelectItem key={slot.value} value={String(slot.value)}>
                          {slot.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {formData.period === "monthly" && (
              <div className="space-y-2">
                <Label>Day of Month</Label>
                <Select
                  value={String(formData.contributionDayOfMonth)}
                  onValueChange={(value) => setFormData({ ...formData, contributionDayOfMonth: Number(value) })}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {daysOfMonth.map((day) => (
                      <SelectItem key={day.value} value={String(day.value)}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Contributions will be triggered on this day each month
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="p-4 rounded-xl bg-muted/50 space-y-3"
        >
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <Info className="h-4 w-4" />
            Group Summary
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Pool per Cycle</span>
              <span className="font-medium text-foreground">
                ₦{formatAmount(formData.contributionAmount * formData.maxMembers)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payout per Member</span>
              <span className="font-medium text-foreground">
                ₦{formatAmount(formData.contributionAmount * formData.maxMembers * 0.98)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Service Fee (2%)</span>
              <span className="text-muted-foreground">
                ₦{formatAmount(formData.contributionAmount * formData.maxMembers * 0.02)}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Terms Notice */}
        <p className="text-xs text-muted-foreground text-center">
          By creating this group, you agree to our Terms of Service and the 2% service fee on all payouts.
        </p>

        {/* Create Button or Add Members */}
        {createdGroup ? (
          <div className="space-y-3">
            <AddMembersDialog groupId={createdGroup.id} groupName={createdGroup.name}>
              <Button variant="hero" size="xl" className="w-full">
                <UserPlus className="h-5 w-5 mr-2" />
                Add Members
              </Button>
            </AddMembersDialog>
            <Button
              variant="outline"
              size="xl"
              className="w-full"
              onClick={() => navigate("/groups")}
            >
              Go to My Groups
            </Button>
          </div>
        ) : (
          <Button
            variant="hero"
            size="xl"
            className="w-full"
            onClick={handleCreate}
            disabled={!formData.name || isLoading}
          >
            {isLoading ? (
              <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <>
                Create Group
                <Check className="h-5 w-5" />
              </>
            )}
          </Button>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
