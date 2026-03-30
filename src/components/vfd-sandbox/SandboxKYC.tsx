import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, CheckCircle2, ArrowRight, ArrowLeft, RefreshCw, Fingerprint, UserCheck, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDobForVfd(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}-${MONTHS[parseInt(m, 10) - 1]}-${y}`;
}

interface SandboxKYCProps {
  vfd: {
    loading: boolean;
    lookupBvn: (bvn: string) => Promise<unknown>;
    createNoConsent: (bvn: string, dob: string) => Promise<unknown>;
    createConsent: (body: Record<string, unknown>) => Promise<unknown>;
    triggerBvnConsent: (clientId: string) => Promise<unknown>;
    releaseClient: (clientId: string) => Promise<unknown>;
    fetchClient: () => Promise<unknown>;
    client: { vfd_client_id: string | null } | null;
  };
  onComplete: () => void;
}

const steps = [
  { num: 1, label: "BVN Verification", icon: Fingerprint },
  { num: 2, label: "Confirm Details", icon: UserCheck },
  { num: 3, label: "Complete", icon: PartyPopper },
];

export function SandboxKYC({ vfd, onComplete }: SandboxKYCProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [bvn, setBvn] = useState("");
  const [dob, setDob] = useState("");
  const [bvnData, setBvnData] = useState<Record<string, unknown> | null>(null);
  const [kycMethod, setKycMethod] = useState<"no_consent" | "consent">("no_consent");
  const [consentForm, setConsentForm] = useState({
    firstname: "", lastname: "", phone: "", gender: "Male", dateOfBirth: "", address: "",
  });

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
        toast({ title: "BVN Error", description: errMsg, variant: "destructive" });
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
      setStep(2);
      toast({ title: "BVN verified", description: "Please confirm your details" });
    }
  };

  const handleCreateAccount = async () => {
    if (kycMethod === "no_consent") {
      if (!dob) { toast({ title: "Date of birth required", variant: "destructive" }); return; }
      const vfdDob = formatDobForVfd(dob);
      const result = await vfd.createNoConsent(bvn, vfdDob) as Record<string, unknown> | null;
      if (result) {
        const vfdStatus = (result as Record<string, unknown>).vfd_status;
        const vfdData = result.data as Record<string, unknown>;
        if (vfdStatus !== 200 || (vfdData?.status && vfdData.status !== 200 && vfdData.status !== "00")) {
          toast({ title: "VFD Error", description: vfdData?.message?.toString() || "Account creation failed", variant: "destructive" });
          return;
        }
        await vfd.fetchClient();
        setStep(3);
        setTimeout(onComplete, 2000);
      }
    } else {
      const result = await vfd.createConsent({
        ...consentForm, bvn, dateOfBirth: formatDobForVfd(consentForm.dateOfBirth || dob),
      }) as Record<string, unknown> | null;
      if (result?.data) {
        const clientId = ((result.data as Record<string, unknown>)?.data as Record<string, unknown>)?.clientId;
        if (clientId) await vfd.triggerBvnConsent(clientId.toString());
        toast({ title: "OTP sent", description: "Check your phone for the BVN consent OTP" });
      }
    }
  };

  const handleRelease = async () => {
    if (!vfd.client?.vfd_client_id) {
      toast({ title: "No VFD client ID found", variant: "destructive" });
      return;
    }
    await vfd.releaseClient(vfd.client.vfd_client_id);
    await vfd.fetchClient();
    setStep(3);
    setTimeout(onComplete, 2000);
  };

  const bvnInfo = bvnData?.data as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-between px-2">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center gap-0 flex-1">
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                animate={{
                  backgroundColor: step >= s.num ? "hsl(var(--primary))" : "hsl(var(--muted))",
                  scale: step === s.num ? 1.1 : 1,
                }}
                className="w-10 h-10 rounded-full flex items-center justify-center text-primary-foreground"
              >
                {step > s.num ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <s.icon className="h-5 w-5" style={{ color: step >= s.num ? undefined : "hsl(var(--muted-foreground))" }} />
                )}
              </motion.div>
              <span className={`text-[10px] font-medium ${step >= s.num ? "text-primary" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 mx-2">
                <div className={`h-0.5 rounded-full transition-colors ${step > s.num ? "bg-primary" : "bg-muted"}`} />
              </div>
            )}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1: BVN */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="text-center mb-4">
              <h2 className="text-lg font-semibold">Verify Your Identity</h2>
              <p className="text-sm text-muted-foreground">Enter your BVN to get started</p>
            </div>

            <div className="bg-card rounded-2xl border border-border/50 p-5 space-y-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">BVN (Bank Verification Number)</Label>
                <Input
                  value={bvn}
                  onChange={(e) => setBvn(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  placeholder="Enter 11-digit BVN"
                  maxLength={11}
                  className="mt-1.5 text-center text-lg tracking-widest font-mono"
                />
                <div className="flex justify-between mt-1.5">
                  <span className="text-[11px] text-muted-foreground">{bvn.length}/11 digits</span>
                </div>
              </div>

              <div className="rounded-xl bg-warning/5 border border-warning/20 p-3">
                <p className="text-[11px] text-warning font-medium">🧪 Test BVN: 22155258549</p>
                <p className="text-[10px] text-muted-foreground">DOB: 05-Apr-1994</p>
              </div>

              <Button
                onClick={handleBvnLookup}
                disabled={bvn.length !== 11 || vfd.loading}
                className="w-full h-12"
                variant="hero"
              >
                {vfd.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Verify BVN
              </Button>
            </div>
          </motion.div>
        )}

        {/* Step 2: Confirm */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="text-center mb-4">
              <h2 className="text-lg font-semibold">Confirm Your Details</h2>
              <p className="text-sm text-muted-foreground">Review the information from your BVN</p>
            </div>

            {bvnInfo && (
              <div className="bg-card rounded-2xl border border-border/50 p-5 space-y-3">
                {[
                  { label: "Full Name", value: bvnInfo.fullname || bvnInfo.firstName },
                  { label: "Phone", value: bvnInfo.phone || bvnInfo.phoneNumber },
                  { label: "Gender", value: bvnInfo.gender },
                  { label: "Date of Birth", value: bvnInfo.dateOfBirth },
                ].map((field) => (
                  <div key={field.label} className="flex justify-between items-center py-2 border-b border-border/30 last:border-0">
                    <span className="text-xs text-muted-foreground">{field.label}</span>
                    <span className="text-sm font-medium">{field.value?.toString() || "N/A"}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-card rounded-2xl border border-border/50 p-5 space-y-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Date of Birth</Label>
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

              <div>
                <Label className="text-xs font-medium text-muted-foreground">KYC Method</Label>
                <Select value={kycMethod} onValueChange={(v) => setKycMethod(v as "no_consent" | "consent")}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_consent">Quick Setup (No Consent)</SelectItem>
                    <SelectItem value="consent">Full Verification (iGree Consent)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {kycMethod === "consent" && (
                <div className="space-y-3 border-t border-border/30 pt-4">
                  <p className="text-xs font-medium text-muted-foreground">Additional Information</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px]">First Name</Label>
                      <Input value={consentForm.firstname} onChange={(e) => setConsentForm(p => ({ ...p, firstname: e.target.value }))} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-[11px]">Last Name</Label>
                      <Input value={consentForm.lastname} onChange={(e) => setConsentForm(p => ({ ...p, lastname: e.target.value }))} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-[11px]">Phone</Label>
                      <Input value={consentForm.phone} onChange={(e) => setConsentForm(p => ({ ...p, phone: e.target.value }))} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-[11px]">Gender</Label>
                      <Select value={consentForm.gender} onValueChange={(v) => setConsentForm(p => ({ ...p, gender: v }))}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[11px]">Address</Label>
                    <Input value={consentForm.address} onChange={(e) => setConsentForm(p => ({ ...p, address: e.target.value }))} className="mt-1" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={handleCreateAccount} disabled={vfd.loading || !dob} className="flex-1" variant="hero">
                {vfd.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                {kycMethod === "no_consent" ? "Create Account" : "Submit & Verify"}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Success */}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-10 space-y-4"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
              className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto"
            >
              <CheckCircle2 className="h-10 w-10 text-success" />
            </motion.div>
            <h2 className="text-xl font-bold">Account Created!</h2>
            <p className="text-sm text-muted-foreground">
              Your VFD sandbox wallet is ready. Start saving!
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
