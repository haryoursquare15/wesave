import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useVfdBanking } from "@/hooks/useVfdBanking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Shield, Wallet, Send, CreditCard, RefreshCw, CheckCircle2,
  AlertTriangle, User, Building2, History,
} from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Convert YYYY-MM-DD (HTML date input) to DD-MMM-YYYY (VFD format) */
function formatDobForVfd(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}-${MONTHS[parseInt(m, 10) - 1]}-${y}`;
}

export default function VfdSandbox() {
  const navigate = useNavigate();
  const { user, session, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const vfd = useVfdBanking();

  // KYC state
  const [kycStep, setKycStep] = useState<"bvn" | "confirm" | "create" | "done">("bvn");
  const [kycMethod, setKycMethod] = useState<"no_consent" | "consent">("no_consent");
  const [bvn, setBvn] = useState("");
  const [dob, setDob] = useState("");
  const [bvnData, setBvnData] = useState<Record<string, unknown> | null>(null);

  // Consent flow state
  const [consentForm, setConsentForm] = useState({
    firstname: "", lastname: "", phone: "", gender: "Male",
    dateOfBirth: "", address: "",
  });

  // Transfer state
  const [transferForm, setTransferForm] = useState({
    toAccount: "", bankCode: "", amount: "", narration: "", beneficiaryName: "",
  });
  const [banks, setBanks] = useState<Array<{ code: string; name: string }>>([]);

  // Fund state
  const [fundAmount, setFundAmount] = useState("");

  // Balance state
  const [liveBalance, setLiveBalance] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  const initRef = useRef(false);
  useEffect(() => {
    if (authLoading || !user || !session?.access_token || initRef.current) return;
    initRef.current = true;

    void vfd.fetchClient().then((result) => {
      if (result?.data?.account_status === "active") {
        setKycStep("done");
      } else if (result?.data?.account_status === "failed" || result?.data?.account_status === "pending_consent") {
        setKycStep("bvn");
      }
    });

    void vfd.fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, session?.access_token]);

  // BVN Lookup
  const handleBvnLookup = async () => {
    if (bvn.length !== 11) {
      toast({ title: "Invalid BVN", description: "BVN must be 11 digits", variant: "destructive" });
      return;
    }
    const result = await vfd.lookupBvn(bvn);
    if (result) {
      const vfdData = result.data as Record<string, unknown>;
      // Check for VFD error responses (status != 200 or error message)
      if (result.vfd_status !== 200 || (vfdData?.status && vfdData.status !== 200 && vfdData.status !== "00")) {
        const errMsg = vfdData?.message?.toString() || vfdData?.error?.toString() || "BVN lookup failed";
        toast({ title: "BVN Error", description: errMsg, variant: "destructive" });
        return;
      }
      setBvnData(vfdData);
      setKycStep("confirm");
      toast({ title: "BVN found", description: "Please confirm your details" });
    }
  };

  // Create Account - No Consent
  const handleCreateNoConsent = async () => {
    if (!dob) {
      toast({ title: "Date of birth required", variant: "destructive" });
      return;
    }
    const result = await vfd.createNoConsent(bvn, dob);
    if (result) {
      // Check if VFD returned an error status
      const vfdStatus = result.vfd_status;
      const vfdData = result.data as Record<string, unknown>;
      if (vfdStatus !== 200 || (vfdData?.status && vfdData.status !== 200 && vfdData.status !== "00")) {
        const errMsg = vfdData?.message?.toString() || vfdData?.error?.toString() || "Account creation failed";
        toast({ title: "VFD Error", description: errMsg, variant: "destructive" });
        return;
      }
      await vfd.fetchClient();
      setKycStep("done");
      toast({ title: "Account created!", description: "Your VFD sandbox account is active" });
    }
  };

  // Create Account - Consent
  const handleCreateConsent = async () => {
    const result = await vfd.createConsent({
      ...consentForm,
      bvn,
      dateOfBirth: consentForm.dateOfBirth || dob,
    });
    if (result?.data) {
      toast({ title: "Client created", description: "BVN consent OTP will be sent" });
      // Trigger consent
      const clientId =
        (result.data as Record<string, unknown>)?.data &&
        ((result.data as Record<string, unknown>).data as Record<string, unknown>)?.clientId;
      if (clientId) {
        await vfd.triggerBvnConsent(clientId.toString());
        toast({ title: "OTP sent", description: "Check your phone for the BVN consent OTP" });
      }
      setKycStep("create");
    }
  };

  // Release client after consent
  const handleReleaseClient = async () => {
    if (!vfd.client?.vfd_client_id) {
      toast({
        title: "Cannot activate yet",
        description: "No VFD client ID found. The initial account creation may have failed — please retry BVN lookup or consent first.",
        variant: "destructive",
      });
      return;
    }
    const result = await vfd.releaseClient(vfd.client.vfd_client_id);
    if (result) {
      await vfd.fetchClient();
      setKycStep("done");
      toast({ title: "Account activated!" });
    }
  };

  // Check balance
  const handleCheckBalance = async () => {
    if (!vfd.client?.vfd_account_number) return;
    const result = await vfd.checkBalance(vfd.client.vfd_account_number);
    if (result?.data) {
      const balData = result.data as Record<string, unknown>;
      const bal = (balData.data as Record<string, unknown>)?.availableBalance;
      setLiveBalance(bal?.toString() || "0");
    }
  };

  // Fund sandbox account
  const handleFund = async () => {
    if (!vfd.client?.vfd_account_number || !fundAmount) return;
    const amount = parseFloat(fundAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    const result = await vfd.sandboxCredit(vfd.client.vfd_account_number, amount);
    if (result) {
      setFundAmount("");
      toast({ title: "Account funded!", description: `₦${amount.toLocaleString()} credited` });
      handleCheckBalance();
      vfd.fetchTransactions();
    }
  };

  // Load banks
  const handleLoadBanks = async () => {
    const result = await vfd.getBankList();
    if (result?.data) {
      const bankData = result.data as Record<string, unknown>;
      const raw = bankData?.data;
      const bankList = Array.isArray(raw) ? raw : [];
      setBanks(bankList);
    }
  };

  // Validate beneficiary
  const handleValidateBeneficiary = async () => {
    if (!transferForm.toAccount || !transferForm.bankCode) return;
    const result = await vfd.validateBeneficiary(transferForm.toAccount, transferForm.bankCode);
    if (result?.data) {
      const benData = result.data as Record<string, unknown>;
      const name = (benData.data as Record<string, unknown>)?.accountName;
      if (name) {
        setTransferForm((prev) => ({ ...prev, beneficiaryName: name.toString() }));
        toast({ title: "Beneficiary verified", description: name.toString() });
      }
    }
  };

  // Transfer
  const handleTransfer = async () => {
    if (!vfd.client?.vfd_account_number) return;
    const amount = parseFloat(transferForm.amount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    const result = await vfd.transfer({
      fromAccount: vfd.client.vfd_account_number,
      toAccount: transferForm.toAccount,
      bankCode: transferForm.bankCode,
      amount,
      narration: transferForm.narration || "VFD Sandbox Transfer",
      beneficiaryName: transferForm.beneficiaryName,
    });
    if (result) {
      setTransferForm({ toAccount: "", bankCode: "", amount: "", narration: "", beneficiaryName: "" });
      toast({ title: "Transfer initiated!", description: `Ref: ${result.reference}` });
      handleCheckBalance();
      vfd.fetchTransactions();
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">VFD Banking Sandbox</h1>
            <p className="text-xs text-muted-foreground">Test environment — no real funds</p>
          </div>
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Sandbox Mode
          </Badge>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Sandbox Banner */}
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Sandbox Mode Active
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                This environment uses VFD sandbox APIs. No real money is involved.
                All transactions are simulated for testing purposes.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* KYC Section - Show if not done */}
        {kycStep !== "done" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                KYC Onboarding
              </CardTitle>
              <CardDescription>
                Complete your identity verification to create a VFD sandbox wallet
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Step indicator */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={kycStep === "bvn" ? "default" : "secondary"} className="text-xs">
                  Step 1: BVN
                </Badge>
                <span>→</span>
                <Badge variant={kycStep === "confirm" ? "default" : "secondary"} className="text-xs">
                  Step 2: Confirm
                </Badge>
                <span>→</span>
                <Badge variant={kycStep === "create" ? "default" : "secondary"} className="text-xs">
                  Step 3: Create
                </Badge>
              </div>

              {kycStep === "bvn" && (
                <div className="space-y-4">
                  <div>
                    <Label>BVN (Bank Verification Number)</Label>
                    <Input
                      value={bvn}
                      onChange={(e) => setBvn(e.target.value.replace(/\D/g, "").slice(0, 11))}
                      placeholder="Enter 11-digit BVN"
                      maxLength={11}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {bvn.length}/11 digits
                    </p>
                  </div>
                  <Button
                    onClick={handleBvnLookup}
                    disabled={bvn.length !== 11 || vfd.loading}
                    className="w-full"
                  >
                    {vfd.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                    Verify BVN
                  </Button>
                </div>
              )}

              {kycStep === "confirm" && (
                <div className="space-y-4">
                  {bvnData && (
                    <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
                      <h4 className="font-medium text-sm">BVN Details</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Name:</span>
                          <p className="font-medium">
                            {(bvnData as Record<string, unknown>)?.fullname?.toString() || "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Phone:</span>
                          <p className="font-medium">
                            {(bvnData as Record<string, unknown>)?.phone?.toString() || "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Gender:</span>
                          <p className="font-medium">
                            {(bvnData as Record<string, unknown>)?.gender?.toString() || "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">DOB:</span>
                          <p className="font-medium">
                            {(bvnData as Record<string, unknown>)?.dateOfBirth?.toString() || "N/A"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label>KYC Method</Label>
                    <Select value={kycMethod} onValueChange={(v) => setKycMethod(v as "no_consent" | "consent")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no_consent">No Consent (Fast)</SelectItem>
                        <SelectItem value="consent">Consent Flow (iGree)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Date of Birth (DD-MMM-YYYY)</Label>
                    <Input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      placeholder="Select date"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {dob ? `Will be sent as: ${formatDobForVfd(dob)}` : "Select your date of birth"}
                    </p>
                  </div>

                  {kycMethod === "consent" && (
                    <div className="space-y-3 border rounded-lg p-4">
                      <h4 className="text-sm font-medium">Additional Details (Consent Flow)</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>First Name</Label>
                          <Input
                            value={consentForm.firstname}
                            onChange={(e) => setConsentForm((p) => ({ ...p, firstname: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label>Last Name</Label>
                          <Input
                            value={consentForm.lastname}
                            onChange={(e) => setConsentForm((p) => ({ ...p, lastname: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label>Phone</Label>
                          <Input
                            value={consentForm.phone}
                            onChange={(e) => setConsentForm((p) => ({ ...p, phone: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label>Gender</Label>
                          <Select
                            value={consentForm.gender}
                            onValueChange={(v) => setConsentForm((p) => ({ ...p, gender: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Male">Male</SelectItem>
                              <SelectItem value="Female">Female</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label>Address</Label>
                        <Input
                          value={consentForm.address}
                          onChange={(e) => setConsentForm((p) => ({ ...p, address: e.target.value }))}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setKycStep("bvn")}>
                      Back
                    </Button>
                    <Button
                      onClick={kycMethod === "no_consent" ? handleCreateNoConsent : handleCreateConsent}
                      disabled={vfd.loading || !dob}
                      className="flex-1"
                    >
                      {vfd.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                      {kycMethod === "no_consent" ? "Create Account" : "Submit & Send OTP"}
                    </Button>
                  </div>
                </div>
              )}

              {kycStep === "create" && kycMethod === "consent" && (
                <div className="space-y-4">
                  <div className="rounded-lg border p-4 bg-blue-500/5 border-blue-500/30">
                    <p className="text-sm">
                      A BVN consent OTP has been sent. Once the user confirms consent via their bank,
                      click below to activate the account.
                    </p>
                  </div>
                  <Button
                    onClick={handleReleaseClient}
                    disabled={vfd.loading}
                    className="w-full"
                  >
                    {vfd.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                    Release & Activate Account
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Wallet & Actions - Show after KYC done */}
        {kycStep === "done" && vfd.client && (
          <Tabs defaultValue="wallet" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="wallet">
                <Wallet className="h-4 w-4 mr-1" />
                Wallet
              </TabsTrigger>
              <TabsTrigger value="fund">
                <CreditCard className="h-4 w-4 mr-1" />
                Fund
              </TabsTrigger>
              <TabsTrigger value="transfer">
                <Send className="h-4 w-4 mr-1" />
                Transfer
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-4 w-4 mr-1" />
                History
              </TabsTrigger>
            </TabsList>

            {/* Wallet Tab */}
            <TabsContent value="wallet">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-primary" />
                    VFD Sandbox Wallet
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl bg-gradient-to-br from-primary via-primary to-primary/80 p-6 text-primary-foreground">
                    <p className="text-sm opacity-75">Account Number</p>
                    <p className="text-xl font-bold">{vfd.client.vfd_account_number || "Pending"}</p>
                    <Separator className="my-3 bg-white/20" />
                    <p className="text-sm opacity-75">Balance</p>
                    <p className="text-3xl font-bold">
                      ₦{liveBalance ? parseFloat(liveBalance).toLocaleString() : "—"}
                    </p>
                    <div className="flex items-center gap-2 mt-3 text-xs opacity-75">
                      <User className="h-3 w-3" />
                      {vfd.client.full_name || "N/A"}
                      <span className="mx-1">•</span>
                      <Badge variant="secondary" className="text-[10px] bg-white/20 text-white border-0">
                        {vfd.client.tier?.toUpperCase()}
                      </Badge>
                      <span className="mx-1">•</span>
                      <Badge variant="secondary" className="text-[10px] bg-white/20 text-white border-0">
                        {vfd.client.kyc_method === "consent" ? "iGree" : "No Consent"}
                      </Badge>
                    </div>
                  </div>

                  <Button onClick={handleCheckBalance} disabled={vfd.loading} className="w-full">
                    {vfd.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                    Refresh Balance
                  </Button>

                  {/* Client details */}
                  <div className="text-sm space-y-2 border rounded-lg p-4">
                    <h4 className="font-medium">Account Details</h4>
                    <div className="grid grid-cols-2 gap-y-1 text-muted-foreground">
                      <span>VFD Client ID:</span>
                      <span className="font-mono text-foreground">{vfd.client.vfd_client_id || "—"}</span>
                      <span>Account Status:</span>
                      <span className="text-foreground flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        {vfd.client.account_status}
                      </span>
                      <span>BVN:</span>
                      <span className="font-mono text-foreground">
                        {vfd.client.bvn ? `***${vfd.client.bvn.slice(-4)}` : "—"}
                      </span>
                      <span>Source:</span>
                      <span className="text-foreground">{vfd.client.source}</span>
                    </div>
                  </div>

                  {/* Tier upgrade */}
                  {vfd.client.tier === "tier1" && (
                    <Card className="border-blue-500/30">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Building2 className="h-5 w-5 text-blue-500 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">Upgrade to Tier 2</p>
                            <p className="text-xs text-muted-foreground">
                              Add BVN verification for higher transaction limits
                            </p>
                            <Button
                              size="sm"
                              className="mt-2"
                              onClick={() =>
                                vfd.client?.vfd_client_id &&
                                vfd.client?.bvn &&
                                vfd.upgradeTier(vfd.client.bvn, vfd.client.vfd_client_id)
                              }
                              disabled={vfd.loading}
                            >
                              Upgrade Now
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Fund Tab */}
            <TabsContent value="fund">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Fund Sandbox Account
                  </CardTitle>
                  <CardDescription>
                    Credit test funds to your sandbox VFD account
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Amount (₦)</Label>
                    <Input
                      type="number"
                      value={fundAmount}
                      onChange={(e) => setFundAmount(e.target.value)}
                      placeholder="Enter amount"
                      min={1}
                    />
                  </div>
                  <div className="flex gap-2">
                    {[1000, 5000, 10000, 50000].map((amt) => (
                      <Button
                        key={amt}
                        variant="outline"
                        size="sm"
                        onClick={() => setFundAmount(amt.toString())}
                      >
                        ₦{amt.toLocaleString()}
                      </Button>
                    ))}
                  </div>
                  <Button
                    onClick={handleFund}
                    disabled={vfd.loading || !fundAmount}
                    className="w-full"
                  >
                    {vfd.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                    Fund Account
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Transfer Tab */}
            <TabsContent value="transfer">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5 text-primary" />
                    Transfer Funds
                  </CardTitle>
                  <CardDescription>
                    Send funds to another bank account (sandbox)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button variant="outline" onClick={handleLoadBanks} disabled={vfd.loading} size="sm">
                    {banks.length > 0 ? `${banks.length} banks loaded` : "Load Bank List"}
                  </Button>

                  <div>
                    <Label>Bank</Label>
                    <Select
                      value={transferForm.bankCode}
                      onValueChange={(v) => setTransferForm((p) => ({ ...p, bankCode: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select bank" />
                      </SelectTrigger>
                      <SelectContent>
                        {banks.map((bank) => (
                          <SelectItem key={bank.code} value={bank.code}>
                            {bank.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Account Number</Label>
                    <div className="flex gap-2">
                      <Input
                        value={transferForm.toAccount}
                        onChange={(e) =>
                          setTransferForm((p) => ({ ...p, toAccount: e.target.value.replace(/\D/g, "").slice(0, 10) }))
                        }
                        placeholder="10-digit account number"
                        maxLength={10}
                      />
                      <Button
                        variant="outline"
                        onClick={handleValidateBeneficiary}
                        disabled={transferForm.toAccount.length !== 10 || !transferForm.bankCode || vfd.loading}
                        size="sm"
                      >
                        Verify
                      </Button>
                    </div>
                    {transferForm.beneficiaryName && (
                      <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {transferForm.beneficiaryName}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label>Amount (₦)</Label>
                    <Input
                      type="number"
                      value={transferForm.amount}
                      onChange={(e) => setTransferForm((p) => ({ ...p, amount: e.target.value }))}
                      placeholder="Enter amount"
                    />
                  </div>

                  <div>
                    <Label>Narration</Label>
                    <Input
                      value={transferForm.narration}
                      onChange={(e) => setTransferForm((p) => ({ ...p, narration: e.target.value }))}
                      placeholder="Transfer description"
                    />
                  </div>

                  <Button
                    onClick={handleTransfer}
                    disabled={
                      vfd.loading ||
                      !transferForm.toAccount ||
                      !transferForm.bankCode ||
                      !transferForm.amount
                    }
                    className="w-full"
                  >
                    {vfd.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                    Send Transfer
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <History className="h-5 w-5 text-primary" />
                      Transaction History
                    </CardTitle>
                    <CardDescription>{vfd.transactions.length} transactions</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => vfd.fetchTransactions()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {vfd.transactions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No transactions yet. Fund your account to get started.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {vfd.transactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between border rounded-lg p-3"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-8 w-8 rounded-full flex items-center justify-center ${
                                tx.transaction_type === "credit"
                                  ? "bg-green-500/10 text-green-600"
                                  : "bg-red-500/10 text-red-600"
                              }`}
                            >
                              {tx.transaction_type === "credit" ? (
                                <CreditCard className="h-4 w-4" />
                              ) : (
                                <Send className="h-4 w-4" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium capitalize">
                                {tx.transaction_type}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {tx.description || tx.reference || "—"}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {new Date(tx.created_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p
                              className={`text-sm font-semibold ${
                                tx.transaction_type === "credit" ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {tx.transaction_type === "credit" ? "+" : "-"}₦
                              {tx.amount.toLocaleString()}
                            </p>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                tx.status === "completed"
                                  ? "text-green-600 border-green-500/30"
                                  : tx.status === "failed"
                                  ? "text-red-600 border-red-500/30"
                                  : "text-amber-600 border-amber-500/30"
                              }`}
                            >
                              {tx.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
