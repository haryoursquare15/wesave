import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, CheckCircle2, ArrowRight, ArrowLeft, RefreshCw,
  Fingerprint, UserCheck, PartyPopper, Crown, Star, Zap,
  ChevronUp, Lock, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { SandboxKYCDocumentUpload } from "./SandboxKYCDocumentUpload";

import { getUserFriendlyError } from "@/lib/errorMessages";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDobForVfd(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}-${MONTHS[parseInt(m, 10) - 1]}-${y}`;
}

const TIERS = [
  {
    level: 1,
    name: "Tier 1 — Starter",
    icon: Shield,
    color: "from-blue-500 to-blue-600",
    badge: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    dailyLimit: "₦30,000",
    txnLimit: "₦30,000",
    requirements: ["BVN or NIN", "Date of Birth"],
    description: "Basic account for everyday transactions",
  },
  {
    level: 2,
    name: "Tier 2 — Standard",
    icon: Star,
    color: "from-primary to-primary/80",
    badge: "bg-primary/10 text-primary border-primary/20",
    dailyLimit: "₦100,000",
    txnLimit: "₦100,000",
    requirements: ["BVN + NIN", "Date of Birth", "Address", "Government ID"],
    description: "Enhanced limits for regular users",
  },
  {
    level: 3,
    name: "Tier 3 — Premium",
    icon: Crown,
    color: "from-gold to-amber-500",
    badge: "bg-gold/10 text-gold border-gold/20",
    dailyLimit: "₦10,000,000",
    txnLimit: "₦1,000,000",
    requirements: ["BVN + NIN", "DOB", "Address", "Government ID", "Utility Bill", "Passport Photo"],
    description: "Maximum limits for power users",
  },
];

// Test data from VFD docs
const TEST_DATA = [
  { bvn: "22222222252", nin: "23230042941", dob: "05-Apr-1994", name: "Phil Bull Holden" },
  { bvn: "22222222253", nin: "01947597293", dob: "05-Apr-1994", name: "Golaith Chesnut David" },
  { bvn: "22222222254", nin: "10392320193", dob: "05-Apr-1994", name: "Abdul Adesanya Ibrahim" },
];

interface SandboxKYCProps {
  vfd: {
    loading: boolean;
    lookupBvn: (bvn: string) => Promise<unknown>;
    createTiered: (body: { bvn?: string; nin?: string; dateOfBirth: string; address?: string }) => Promise<unknown>;
    createNoConsent: (bvn: string, dob: string) => Promise<unknown>;
    createConsent: (body: Record<string, unknown>) => Promise<unknown>;
    triggerBvnConsent: (clientId: string) => Promise<unknown>;
    releaseClient: (clientId: string) => Promise<unknown>;
    upgradeTier: (body: { bvn?: string; nin?: string; address?: string }) => Promise<unknown>;
    fetchClient: () => Promise<unknown>;
    client: { vfd_client_id: string | null; tier?: string; nin?: string | null; address?: string | null; bvn?: string | null } | null;
  };
  onComplete: () => void;
}

type Step = "tier_select" | "identity" | "confirm" | "success";

export function SandboxKYC({ vfd, onComplete }: SandboxKYCProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("tier_select");
  const [selectedTier, setSelectedTier] = useState(1);
  const [bvn, setBvn] = useState("");
  const [nin, setNin] = useState("");
  const [dob, setDob] = useState("");
  const [address, setAddress] = useState("");
  const [bvnData, setBvnData] = useState<Record<string, unknown> | null>(null);
  const [isUpgrade, setIsUpgrade] = useState(false);
  const [docsReady, setDocsReady] = useState(false);

  const currentTierNum = vfd.client?.tier ? parseInt(vfd.client.tier.replace("tier", "")) : 0;

  const handleTierSelect = (tier: number) => {
    if (currentTierNum > 0 && tier <= currentTierNum) return;
    setSelectedTier(tier);
    setIsUpgrade(currentTierNum > 0);
    setStep("identity");
  };

  const handleBvnLookup = async () => {
    if (bvn.length !== 11) {
      toast({ title: "Invalid BVN", description: "BVN must be 11 digits", variant: "destructive" });
      return;
    }
    const result = await vfd.lookupBvn(bvn) as Record<string, unknown> | null;
    if (result) {
      const vfdData = result.data as Record<string, unknown>;
      if ((result as Record<string, unknown>).vfd_status !== 200 || (vfdData?.status && vfdData.status !== 200 && vfdData.status !== "00")) {
        const errMsg = vfdData?.message?.toString() || vfdData?.error?.toString() || "BVN lookup failed";
        toast({ title: "BVN Error", description: getUserFriendlyError(errMsg), variant: "destructive" });
        return;
      }
      setBvnData(vfdData);
      const bvnDob = ((vfdData?.data as Record<string, unknown>)?.dateOfBirth)?.toString();
      if (bvnDob && !dob) {
        const parts = bvnDob.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
        if (parts) {
          const monthIdx = MONTHS.findIndex(m => m.toLowerCase() === parts[2].toLowerCase());
          if (monthIdx >= 0) setDob(`${parts[3]}-${String(monthIdx + 1).padStart(2, "0")}-${parts[1]}`);
        }
      }
      setStep("confirm");
      toast({ title: "BVN verified", description: "Confirm your details to proceed" });
    }
  };

  const handleProceedToConfirm = () => {
    // For NIN-only Tier 1 or upgrade flows, skip BVN lookup
    if (selectedTier === 1 && !bvn && nin) {
      setStep("confirm");
      return;
    }
    if (isUpgrade) {
      setStep("confirm");
      return;
    }
    // Otherwise need BVN lookup first
    handleBvnLookup();
  };

  const handleCreateAccount = async () => {
    const vfdDob = formatDobForVfd(dob);

    if (isUpgrade) {
      // Upgrade existing account
      const upgradeBody: { bvn?: string; nin?: string; address?: string } = {};
      if (selectedTier >= 2 && !vfd.client?.bvn && bvn) upgradeBody.bvn = bvn;
      if (selectedTier >= 2 && !vfd.client?.nin && nin) upgradeBody.nin = nin;
      if (selectedTier >= 3 && address) upgradeBody.address = address;

      const result = await vfd.upgradeTier(upgradeBody) as Record<string, unknown> | null;
      if (result) {
        const vfdData = result.data as Record<string, unknown>;
        if (vfdData?.status === "00") {
          await vfd.fetchClient();
          setStep("success");
          setTimeout(onComplete, 2500);
          return;
        }
        toast({ title: "Upgrade Failed", description: getUserFriendlyError(vfdData?.message?.toString() || "Could not upgrade account"), variant: "destructive" });
      }
      return;
    }

    // New tiered account creation
    const body: { bvn?: string; nin?: string; dateOfBirth: string; address?: string } = {
      dateOfBirth: vfdDob,
    };

    if (bvn) body.bvn = bvn;
    if (nin) body.nin = nin;
    if (selectedTier >= 3 && address) body.address = address;

    const result = await vfd.createTiered(body) as Record<string, unknown> | null;
    if (result) {
      const vfdData = result.data as Record<string, unknown>;
      if (vfdData?.status !== "00" && vfdData?.status !== "01") {
        toast({ title: "VFD Error", description: getUserFriendlyError(vfdData?.message?.toString() || "Account creation failed"), variant: "destructive" });
        return;
      }
      await vfd.fetchClient();
      setStep("success");
      setTimeout(onComplete, 2500);
    }
  };

  const bvnInfo = bvnData?.data as Record<string, unknown> | undefined;
  const tierConfig = TIERS[selectedTier - 1];
  const needsBvn = selectedTier >= 1 && (isUpgrade ? !vfd.client?.bvn : true);
  const needsNin = selectedTier >= 2 && (isUpgrade ? !vfd.client?.nin : true);
  const needsAddress = selectedTier >= 3;

  // Validation
  const canProceed = () => {
    const docsOk = selectedTier === 1 || docsReady;
    if (selectedTier === 1) {
      return (bvn.length === 11 || nin.length === 11) && !!dob;
    }
    if (selectedTier === 2) {
      if (isUpgrade) {
        return (needsBvn ? bvn.length === 11 : true) && (needsNin ? nin.length === 11 : true) && docsOk;
      }
      return bvn.length === 11 && nin.length === 11 && !!dob && docsOk;
    }
    if (selectedTier === 3) {
      if (isUpgrade) {
        return (needsBvn ? bvn.length === 11 : true) && (needsNin ? nin.length === 11 : true) && address.length > 5 && docsOk;
      }
      return bvn.length === 11 && nin.length === 11 && !!dob && address.length > 5 && docsOk;
    }
    return false;
  };

  return (
    <div className="space-y-5">
      {/* Step Progress */}
      <div className="flex items-center justify-between px-1">
        {[
          { key: "tier_select", label: "Select Tier", icon: Zap },
          { key: "identity", label: "Identity", icon: Fingerprint },
          { key: "confirm", label: "Confirm", icon: UserCheck },
          { key: "success", label: "Complete", icon: PartyPopper },
        ].map((s, i, arr) => {
          const steps: Step[] = ["tier_select", "identity", "confirm", "success"];
          const stepIdx = steps.indexOf(step);
          const thisIdx = steps.indexOf(s.key as Step);
          const isActive = thisIdx <= stepIdx;

          return (
            <div key={s.key} className="flex items-center gap-0 flex-1">
              <div className="flex flex-col items-center gap-1">
                <motion.div
                  animate={{
                    backgroundColor: isActive ? "hsl(var(--primary))" : "hsl(var(--muted))",
                    scale: step === s.key ? 1.1 : 1,
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                >
                  {thisIdx < stepIdx ? (
                    <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                  ) : (
                    <s.icon className="h-4 w-4" style={{ color: isActive ? undefined : "hsl(var(--muted-foreground))" }} />
                  )}
                </motion.div>
                <span className={`text-[9px] font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
              </div>
              {i < arr.length - 1 && (
                <div className="flex-1 mx-1.5">
                  <div className={`h-0.5 rounded-full transition-colors ${thisIdx < stepIdx ? "bg-primary" : "bg-muted"}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* STEP: Tier Selection */}
        {step === "tier_select" && (
          <motion.div
            key="tier_select"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="text-center mb-2">
              <h2 className="text-lg font-bold">
                {currentTierNum > 0 ? "Upgrade Your Account" : "Choose Your Account Tier"}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {currentTierNum > 0
                  ? `Currently on Tier ${currentTierNum}. Select a higher tier to upgrade.`
                  : "Higher tiers unlock greater transaction limits"
                }
              </p>
            </div>

            <div className="space-y-3">
              {TIERS.map((tier) => {
                const isCurrentTier = tier.level === currentTierNum;
                const isLowerTier = tier.level < currentTierNum;
                const isDisabled = isCurrentTier || isLowerTier;

                return (
                  <motion.button
                    key={tier.level}
                    whileTap={!isDisabled ? { scale: 0.98 } : undefined}
                    onClick={() => !isDisabled && handleTierSelect(tier.level)}
                    disabled={isDisabled}
                    className={`w-full text-left rounded-2xl border p-4 transition-all ${
                      isDisabled
                        ? "opacity-50 cursor-not-allowed border-border/30 bg-muted/20"
                        : "border-border/50 bg-card hover:border-primary/50 hover:shadow-md active:scale-[0.99]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tier.color} flex items-center justify-center shrink-0`}>
                        <tier.icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold">{tier.name}</span>
                          {isCurrentTier && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30 text-primary">
                              Current
                            </Badge>
                          )}
                          {isLowerTier && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-muted-foreground/30 text-muted-foreground">
                              <Lock className="h-2.5 w-2.5 mr-0.5" /> Done
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">{tier.description}</p>
                        <div className="flex gap-3 mt-2">
                          <div>
                            <span className="text-[9px] text-muted-foreground block">Daily Limit</span>
                            <span className="text-xs font-semibold text-foreground">{tier.dailyLimit}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-muted-foreground block">Per Transaction</span>
                            <span className="text-xs font-semibold text-foreground">{tier.txnLimit}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {tier.requirements.map((req) => (
                            <span key={req} className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {req}
                            </span>
                          ))}
                        </div>
                      </div>
                      {!isDisabled && (
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* STEP: Identity Input */}
        {step === "identity" && (
          <motion.div
            key="identity"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="text-center mb-2">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${tierConfig.color} flex items-center justify-center`}>
                  <tierConfig.icon className="h-3.5 w-3.5 text-white" />
                </div>
                <h2 className="text-lg font-bold">{isUpgrade ? "Upgrade to" : ""} {tierConfig.name}</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                {isUpgrade ? "Provide additional details to upgrade" : "Enter your identity details"}
              </p>
            </div>

            <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-4">
              {/* BVN Input */}
              {needsBvn && (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">
                    BVN (Bank Verification Number)
                    {selectedTier >= 2 && <span className="text-destructive ml-1">*</span>}
                    {selectedTier === 1 && <span className="text-muted-foreground/60 ml-1">or NIN below</span>}
                  </Label>
                  <Input
                    value={bvn}
                    onChange={(e) => setBvn(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="Enter 11-digit BVN"
                    maxLength={11}
                    className="mt-1.5 text-center text-base tracking-widest font-mono"
                  />
                  <span className="text-[10px] text-muted-foreground mt-1 block">{bvn.length}/11</span>
                </div>
              )}

              {/* NIN Input */}
              {needsNin && (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">
                    NIN (National Identity Number)
                    {selectedTier >= 2 && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Input
                    value={nin}
                    onChange={(e) => setNin(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="Enter 11-digit NIN"
                    maxLength={11}
                    className="mt-1.5 text-center text-base tracking-widest font-mono"
                  />
                  <span className="text-[10px] text-muted-foreground mt-1 block">{nin.length}/11</span>
                </div>
              )}

              {/* DOB */}
              {!isUpgrade && (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Date of Birth <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="mt-1.5"
                  />
                  {dob && (
                    <p className="text-[10px] text-muted-foreground mt-1">Sent as: {formatDobForVfd(dob)}</p>
                  )}
                </div>
              )}

              {/* Address for Tier 3 */}
              {needsAddress && (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Residential Address <span className="text-destructive">*</span></Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. 10, Johnson Street, Ikeja, Lagos"
                    className="mt-1.5"
                  />
                </div>
              )}
            </div>

            {/* Document upload (Tier 2 & 3) */}
            {selectedTier >= 2 && (
              <SandboxKYCDocumentUpload
                tierLevel={selectedTier}
                onAllRequiredUploaded={setDocsReady}
              />
            )}

            {/* Test Data Helper */}
            <div className="rounded-xl bg-warning/5 border border-warning/20 p-3">
              <p className="text-[11px] text-warning font-medium mb-1.5">🧪 Sandbox Test Data</p>
              <div className="space-y-1.5">
                {TEST_DATA.slice(0, 2).map((td, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setBvn(td.bvn);
                      setNin(td.nin);
                      if (!dob) {
                        setDob("1994-04-05");
                      }
                    }}
                    className="w-full text-left text-[10px] p-1.5 rounded-lg hover:bg-warning/10 transition-colors"
                  >
                    <span className="font-medium text-foreground">{td.name}</span>
                    <span className="text-muted-foreground ml-1">BVN: {td.bvn} | NIN: {td.nin}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("tier_select")} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                onClick={handleProceedToConfirm}
                disabled={!canProceed() || vfd.loading}
                className="flex-1"
                variant="hero"
              >
                {vfd.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                Continue <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* STEP: Confirm */}
        {step === "confirm" && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="text-center mb-2">
              <h2 className="text-lg font-bold">{isUpgrade ? "Confirm Upgrade" : "Confirm & Create"}</h2>
              <p className="text-xs text-muted-foreground">Review before submitting to VFD</p>
            </div>

            {/* Tier Badge */}
            <div className={`rounded-2xl bg-gradient-to-br ${tierConfig.color} p-4 text-white`}>
              <div className="flex items-center gap-2 mb-2">
                <tierConfig.icon className="h-5 w-5" />
                <span className="font-bold text-sm">{tierConfig.name}</span>
              </div>
              <div className="flex gap-4 text-xs opacity-90">
                <div>
                  <span className="block text-white/70">Daily Limit</span>
                  <span className="font-semibold">{tierConfig.dailyLimit}</span>
                </div>
                <div>
                  <span className="block text-white/70">Per Transaction</span>
                  <span className="font-semibold">{tierConfig.txnLimit}</span>
                </div>
              </div>
            </div>

            {/* BVN Lookup Details */}
            {bvnInfo && (
              <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">BVN Details</p>
                {[
                  { label: "Full Name", value: bvnInfo.fullname || bvnInfo.firstName },
                  { label: "Phone", value: bvnInfo.phone || bvnInfo.phoneNumber },
                  { label: "Gender", value: bvnInfo.gender },
                  { label: "Date of Birth", value: bvnInfo.dateOfBirth },
                ].map((field) => (
                  <div key={field.label} className="flex justify-between items-center py-1.5 border-b border-border/20 last:border-0">
                    <span className="text-[11px] text-muted-foreground">{field.label}</span>
                    <span className="text-xs font-medium">{field.value?.toString() || "N/A"}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Submitted Details Summary */}
            <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">Submission Details</p>
              {bvn && (
                <div className="flex justify-between py-1.5 border-b border-border/20">
                  <span className="text-[11px] text-muted-foreground">BVN</span>
                  <span className="text-xs font-mono">{bvn.slice(0, 4)}****{bvn.slice(-3)}</span>
                </div>
              )}
              {nin && (
                <div className="flex justify-between py-1.5 border-b border-border/20">
                  <span className="text-[11px] text-muted-foreground">NIN</span>
                  <span className="text-xs font-mono">{nin.slice(0, 4)}****{nin.slice(-3)}</span>
                </div>
              )}
              {dob && (
                <div className="flex justify-between py-1.5 border-b border-border/20">
                  <span className="text-[11px] text-muted-foreground">Date of Birth</span>
                  <span className="text-xs">{formatDobForVfd(dob)}</span>
                </div>
              )}
              {address && (
                <div className="flex justify-between py-1.5">
                  <span className="text-[11px] text-muted-foreground">Address</span>
                  <span className="text-xs text-right max-w-[60%]">{address}</span>
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex gap-2">
              <AlertCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground">
                {isUpgrade
                  ? "Your account will be upgraded via VFD's /client/update endpoint. Limits will increase immediately upon success."
                  : "Your account will be created via VFD's new /client/tiers/individual endpoint with the appropriate tier level."
                }
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("identity")} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                onClick={handleCreateAccount}
                disabled={vfd.loading}
                className="flex-1"
                variant="hero"
              >
                {vfd.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : isUpgrade ? <ChevronUp className="h-4 w-4 mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                {isUpgrade ? "Upgrade Account" : "Create Account"}
              </Button>
            </div>
          </motion.div>
        )}

        {/* STEP: Success */}
        {step === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-8 space-y-4"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
              className={`w-20 h-20 rounded-full bg-gradient-to-br ${tierConfig.color} flex items-center justify-center mx-auto shadow-lg`}
            >
              <CheckCircle2 className="h-10 w-10 text-white" />
            </motion.div>
            <div>
              <h2 className="text-xl font-bold">
                {isUpgrade ? "Account Upgraded!" : "Account Created!"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isUpgrade
                  ? `Successfully upgraded to ${tierConfig.name}`
                  : `Your ${tierConfig.name} wallet is ready`
                }
              </p>
            </div>
            <div className="inline-flex gap-3 bg-muted/50 rounded-xl px-4 py-2">
              <div className="text-center">
                <span className="text-[9px] text-muted-foreground block">Daily Limit</span>
                <span className="text-sm font-bold text-primary">{tierConfig.dailyLimit}</span>
              </div>
              <div className="w-px bg-border" />
              <div className="text-center">
                <span className="text-[9px] text-muted-foreground block">Per Transaction</span>
                <span className="text-sm font-bold text-primary">{tierConfig.txnLimit}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
