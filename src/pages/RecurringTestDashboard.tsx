import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CreditCard, RefreshCw, Play, Trash2, Shield, Zap,
  FileText, BarChart3, CheckCircle, AlertTriangle, Clock, Search,
  FlaskConical, Wallet, Activity, Info, ChevronRight, Timer, Ban
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

declare global {
  interface Window {
    FlutterwaveCheckout: (config: Record<string, unknown>) => { close: () => void };
  }
}

interface TestToken {
  id: string;
  user_id: string;
  card_token: string;
  first_6digits: string | null;
  last_4digits: string | null;
  expiry: string | null;
  card_type: string | null;
  is_active: boolean;
  created_at: string;
}

interface Payment {
  id: string;
  user_id: string;
  group_id: string | null;
  amount: number;
  tx_ref: string;
  flw_transaction_id: string | null;
  flw_ref: string | null;
  status: string;
  payment_cycle: number | null;
  retry_count: number;
  max_retries: number;
  failure_reason: string | null;
  processor_response: string | null;
  charge_type: string;
  verified_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ConfirmedLedgerEntry {
  id: string;
  payment_id: string;
  user_id: string;
  amount: number;
  tx_ref: string;
  flw_transaction_id: string | null;
  payment_cycle: number | null;
  confirmed_at: string;
  created_at: string;
}

interface WebhookLog {
  id: string;
  event_type: string;
  tx_ref: string | null;
  flw_ref: string | null;
  flw_transaction_id: string | null;
  status: string | null;
  amount: number | null;
  processed: boolean;
  verification_source: string | null;
  created_at: string;
}

interface TestGroup {
  id: string;
  name: string;
  contribution_amount: number;
  frequency: string;
  mode: string;
  status: string;
}

const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { icon: React.ReactNode; className: string }> = {
    final_success: { icon: <CheckCircle className="h-3 w-3" />, className: "bg-green-500/10 text-green-700 border-green-500/20" },
    successful: { icon: <CheckCircle className="h-3 w-3" />, className: "bg-green-500/10 text-green-700 border-green-500/20" },
    success: { icon: <CheckCircle className="h-3 w-3" />, className: "bg-green-500/10 text-green-700 border-green-500/20" },
    final_failed: { icon: <Ban className="h-3 w-3" />, className: "bg-destructive/10 text-destructive border-destructive/20" },
    failed: { icon: <Ban className="h-3 w-3" />, className: "bg-destructive/10 text-destructive border-destructive/20" },
    pending: { icon: <Timer className="h-3 w-3" />, className: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20" },
    initiated: { icon: <Activity className="h-3 w-3" />, className: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
    unresolved: { icon: <AlertTriangle className="h-3 w-3" />, className: "bg-orange-500/10 text-orange-700 border-orange-500/20" },
    reversed: { icon: <RefreshCw className="h-3 w-3" />, className: "bg-purple-500/10 text-purple-700 border-purple-500/20" },
  };
  const c = config[status] || { icon: null, className: "bg-muted text-muted-foreground border-border" };
  return (
    <Badge variant="outline" className={`gap-1 font-mono text-[10px] uppercase tracking-wider ${c.className}`}>
      {c.icon} {status}
    </Badge>
  );
};

const StatCard = ({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: string }) => (
  <Card className="relative overflow-hidden">
    <div className={`absolute top-0 left-0 w-1 h-full ${accent || 'bg-primary'}`} />
    <CardContent className="p-4 pl-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted/50">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function RecurringTestDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { toast } = useToast();

  const [tokens, setTokens] = useState<TestToken[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [confirmedLedger, setConfirmedLedger] = useState<ConfirmedLedgerEntry[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [testGroups, setTestGroups] = useState<TestGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!adminLoading && !isAdmin && user) {
      toast({ title: "Access Denied", description: "Admin only.", variant: "destructive" });
      navigate("/dashboard");
    }
  }, [isAdmin, adminLoading, user, navigate, toast]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const resp = await supabase.functions.invoke('recurring-test-charge', {
        body: { action: 'get_status' },
      });
      if (resp.data?.success) {
        setTokens(resp.data.tokens || []);
        setPayments(resp.data.payments || []);
        setConfirmedLedger(resp.data.confirmed_ledger || []);
        setWebhookLogs(resp.data.webhook_logs || []);
        setTestGroups(resp.data.test_groups || []);
      }
    } catch (err) {
      console.error('Failed to fetch test data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin && user) fetchData();
  }, [isAdmin, user]);

  useEffect(() => {
    if (document.getElementById('flw-inline-script')) return;
    const script = document.createElement('script');
    script.id = 'flw-inline-script';
    script.src = 'https://checkout.flutterwave.com/v3.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      const el = document.getElementById('flw-inline-script');
      if (el) document.body.removeChild(el);
    };
  }, []);

  const initiateTestPayment = async () => {
    setActionLoading('initiate');
    try {
      const userEmail = user?.email || 'test@wesave.ng';
      const resp = await supabase.functions.invoke('recurring-test-charge', {
        body: { action: 'initiate_payment', email: userEmail, name: 'Test User', amount: 1000 },
      });
      if (!resp.data?.success) {
        toast({ title: "Error", description: resp.data?.error || 'Failed', variant: "destructive" });
        setActionLoading(null);
        return;
      }
      const config = resp.data.payment_link_data;
      if (!window.FlutterwaveCheckout) {
        toast({ title: "Error", description: "Flutterwave SDK not loaded yet.", variant: "destructive" });
        setActionLoading(null);
        return;
      }
      window.FlutterwaveCheckout({
        public_key: config.public_key,
        tx_ref: config.tx_ref,
        amount: config.amount,
        currency: config.currency,
        redirect_url: config.redirect_url,
        customer: config.customer,
        customizations: config.customizations,
        meta: config.meta,
        payment_options: 'card',
        callback: async (response: Record<string, unknown>) => {
          try {
            const verifyResp = await supabase.functions.invoke('recurring-test-charge', {
              body: { action: 'verify_and_save_token', transaction_id: response.transaction_id, tx_ref: response.tx_ref },
            });
            if (verifyResp.data?.success) {
              toast({ title: "Token Saved!", description: verifyResp.data.message });
            } else {
              toast({ title: "Verification Issue", description: verifyResp.data?.error || 'Could not save token', variant: "destructive" });
            }
          } catch {
            toast({ title: "Error", description: "Failed to verify transaction", variant: "destructive" });
          }
          fetchData();
          setActionLoading(null);
        },
        onclose: () => setActionLoading(null),
      });
    } catch {
      toast({ title: "Error", description: 'Network error', variant: "destructive" });
      setActionLoading(null);
    }
  };

  const runRecurringCharge = async (tokenId: string) => {
    setActionLoading(`charge-${tokenId}`);
    try {
      const resp = await supabase.functions.invoke('recurring-test-charge', {
        body: { action: 'run_recurring_charge', token_id: tokenId },
      });
      if (resp.data?.success) {
        toast({
          title: resp.data.charge_status === 'success' ? "Charge Initiated" : "Charge Failed",
          description: resp.data.message,
          variant: resp.data.charge_status === 'success' ? "default" : "destructive",
        });
        fetchData();
      } else {
        toast({ title: "Error", description: resp.data?.error || 'Failed', variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: 'Network error', variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const manualVerify = async (paymentId: string) => {
    setActionLoading(`verify-${paymentId}`);
    try {
      const resp = await supabase.functions.invoke('recurring-test-charge', {
        body: { action: 'manual_verify', payment_id: paymentId },
      });
      if (resp.data?.success) {
        toast({
          title: resp.data.status === 'final_success' ? "Verified & Confirmed!" : "Still Pending",
          description: resp.data.status === 'final_success' ? 'Ledger entry created.' : `Status: ${resp.data.status}`,
          variant: resp.data.status === 'final_success' ? "default" : "destructive",
        });
        fetchData();
      } else {
        toast({ title: "Error", description: resp.data?.error || 'Verification failed', variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: 'Network error', variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const runSimulation = async (scenario: string) => {
    setActionLoading(`sim-${scenario}`);
    try {
      const resp = await supabase.functions.invoke('recurring-test-charge', {
        body: { action: 'simulate', scenario },
      });
      if (resp.data?.success) {
        toast({ title: "Simulation Created", description: resp.data.message });
        fetchData();
      } else {
        toast({ title: "Error", description: resp.data?.error || 'Failed', variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: 'Network error', variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const triggerVerifyWorker = async () => {
    setActionLoading('verify-worker');
    try {
      const resp = await supabase.functions.invoke('recurring-test-charge', {
        body: { action: 'verify_pending' },
      });
      if (resp.data?.success) {
        toast({ title: "Verification Complete", description: `Processed ${resp.data.verified} transactions.` });
        fetchData();
      } else {
        toast({ title: "Error", description: resp.data?.error || 'Failed', variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: 'Network error', variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const resetTestData = async () => {
    if (!confirm('Are you sure? This will delete ALL test data.')) return;
    setActionLoading('reset');
    try {
      const resp = await supabase.functions.invoke('recurring-test-charge', {
        body: { action: 'reset_test_data' },
      });
      if (resp.data?.success) {
        toast({ title: "Reset Complete", description: "All test data cleared." });
        fetchData();
      }
    } catch {
      toast({ title: "Error", description: 'Reset failed', variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-6">
        <Skeleton className="h-14 w-80" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const pendingCount = payments.filter(p => ['initiated', 'pending'].includes(p.status)).length;
  const confirmedCount = confirmedLedger.length;
  const failedCount = payments.filter(p => ['final_failed', 'unresolved'].includes(p.status)).length;
  const totalAmount = confirmedLedger.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-8">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} className="shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-secondary/10">
                  <Shield className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <h1 className="text-lg font-bold leading-tight">Reconciliation Test Lab</h1>
                  <p className="text-[11px] text-muted-foreground leading-none">Isolated staging · Flutterwave TEST keys</p>
                </div>
                <Badge variant="outline" className="ml-1 bg-yellow-500/10 text-yellow-700 border-yellow-500/20 text-[10px] font-mono uppercase">
                  Sandbox
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={triggerVerifyWorker}
                disabled={actionLoading === 'verify-worker'}
                className="hidden sm:flex"
              >
                <Search className={`h-3.5 w-3.5 mr-1.5 ${actionLoading === 'verify-worker' ? 'animate-spin' : ''}`} />
                Verify Pending
              </Button>
              <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="destructive" size="sm" onClick={resetTestData} disabled={actionLoading === 'reset'}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                <span className="hidden sm:inline">Reset</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard
            icon={<CreditCard className="h-4 w-4 text-primary" />}
            label="Tokens"
            value={tokens.length}
            sub={`${tokens.filter(t => t.is_active).length} active`}
            accent="bg-primary"
          />
          <StatCard
            icon={<Clock className="h-4 w-4 text-yellow-600" />}
            label="Pending"
            value={pendingCount}
            sub="Awaiting verification"
            accent="bg-yellow-500"
          />
          <StatCard
            icon={<CheckCircle className="h-4 w-4 text-green-600" />}
            label="Confirmed"
            value={confirmedCount}
            sub="Ledger entries"
            accent="bg-green-500"
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
            label="Failed"
            value={failedCount}
            sub="Failed or unresolved"
            accent="bg-destructive"
          />
          <StatCard
            icon={<Wallet className="h-4 w-4 text-secondary" />}
            label="Total Confirmed"
            value={`₦${totalAmount.toLocaleString()}`}
            sub="Verified amount"
            accent="bg-secondary"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Token Generation */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-primary/10">
                  <CreditCard className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm">Generate Card Token</CardTitle>
                  <CardDescription className="text-xs">First payment to capture test card token</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={initiateTestPayment} disabled={actionLoading === 'initiate'} className="w-full">
                <Zap className="h-4 w-4 mr-2" />
                {actionLoading === 'initiate' ? 'Initializing...' : 'Initiate Test Payment (₦1,000)'}
              </Button>
              <div className="rounded-md bg-muted/30 border border-border/50 p-2.5">
                <p className="text-[11px] text-muted-foreground font-mono leading-relaxed">
                  Card: 5531 8866 5214 2950 · CVV: 564 · Exp: 09/32
                  <br />PIN: 3310 · OTP: 12345
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Failure Simulation */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-orange-500/10">
                  <FlaskConical className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <CardTitle className="text-sm">Failure Simulation</CardTitle>
                  <CardDescription className="text-xs">Test edge cases & reconciliation handling</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { key: 'webhook_not_received', label: 'No Webhook', desc: 'Payment stuck in pending' },
                  { key: 'pending_timeout', label: '24h Timeout', desc: 'Exceeds timeout window' },
                  { key: 'failed_charge', label: 'Failed Charge', desc: 'Card decline simulation' },
                ].map(sim => (
                  <Button
                    key={sim.key}
                    variant="outline"
                    size="sm"
                    className="justify-between h-auto py-2 px-3"
                    onClick={() => runSimulation(sim.key)}
                    disabled={!!actionLoading}
                  >
                    <div className="text-left">
                      <span className="text-xs font-medium">{sim.label}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{sim.desc}</span>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Data Tabs */}
        <Tabs defaultValue="payments" className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="payments" className="gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" /> Payments
              {payments.length > 0 && <Badge variant="secondary" className="ml-1 h-4 min-w-[16px] px-1 text-[10px]">{payments.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="tokens" className="gap-1.5 text-xs">
              <CreditCard className="h-3.5 w-3.5" /> Tokens
              {tokens.length > 0 && <Badge variant="secondary" className="ml-1 h-4 min-w-[16px] px-1 text-[10px]">{tokens.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="confirmed" className="gap-1.5 text-xs">
              <CheckCircle className="h-3.5 w-3.5" /> Ledger
              {confirmedCount > 0 && <Badge variant="secondary" className="ml-1 h-4 min-w-[16px] px-1 text-[10px]">{confirmedCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" /> Logs
            </TabsTrigger>
          </TabsList>

          {/* Payments Tab */}
          <TabsContent value="payments">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Transaction State Machine
                </CardTitle>
                <CardDescription className="text-xs">
                  initiated → pending → final_success / final_failed / unresolved. Only final_success writes to the confirmed ledger.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <EmptyState icon={<BarChart3 className="h-8 w-8" />} message="No payment records yet" sub="Run a charge or simulation to begin" />
                ) : (
                  <div className="overflow-x-auto -mx-6">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Cycle</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Amount</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">TX Ref</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Status</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Type</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Retries</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Response</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">FLW ID</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Time</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map(p => (
                          <TableRow key={p.id} className="group">
                            <TableCell className="font-mono text-xs">{p.payment_cycle || '-'}</TableCell>
                            <TableCell className="font-medium text-xs">₦{Number(p.amount).toLocaleString()}</TableCell>
                            <TableCell>
                              <code className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded max-w-[140px] truncate block">
                                {p.tx_ref}
                              </code>
                            </TableCell>
                            <TableCell><StatusBadge status={p.status} /></TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] font-mono">{p.charge_type}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{p.retry_count}/{p.max_retries}</TableCell>
                            <TableCell>
                              <span className="text-[10px] text-muted-foreground max-w-[100px] truncate block">
                                {p.processor_response || p.failure_reason || '—'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <code className="text-[10px] text-muted-foreground">{p.flw_transaction_id || '—'}</code>
                            </TableCell>
                            <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {new Date(p.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              {['initiated', 'pending', 'unresolved'].includes(p.status) && p.flw_transaction_id && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => manualVerify(p.id)}
                                  disabled={actionLoading === `verify-${p.id}`}
                                >
                                  <Search className="h-3 w-3 mr-1" />
                                  <span className="text-[10px]">{actionLoading === `verify-${p.id}` ? '...' : 'Verify'}</span>
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tokens Tab */}
          <TabsContent value="tokens">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Stored Card Tokens</CardTitle>
                <CardDescription className="text-xs">Captured from test payments. Use to trigger recurring charges.</CardDescription>
              </CardHeader>
              <CardContent>
                {tokens.length === 0 ? (
                  <EmptyState icon={<CreditCard className="h-8 w-8" />} message="No tokens yet" sub="Complete a test payment to capture a card token" />
                ) : (
                  <div className="space-y-2">
                    {tokens.map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-md bg-muted/50">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">
                                {t.first_6digits || '••••••'}····{t.last_4digits || '••••'}
                              </span>
                              <Badge variant={t.is_active ? 'default' : 'secondary'} className="text-[10px]">
                                {t.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-[11px] text-muted-foreground">{t.card_type || 'Unknown'}</span>
                              <span className="text-[11px] text-muted-foreground">Exp: {t.expiry || '—'}</span>
                              <span className="text-[11px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => runRecurringCharge(t.id)}
                          disabled={actionLoading === `charge-${t.id}` || !t.is_active}
                          className="shrink-0"
                        >
                          <Play className="h-3 w-3 mr-1.5" />
                          {actionLoading === `charge-${t.id}` ? 'Charging...' : 'Charge ₦1,000'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Confirmed Ledger Tab */}
          <TabsContent value="confirmed">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <div>
                    <CardTitle className="text-sm">Confirmed Ledger</CardTitle>
                    <CardDescription className="text-xs">
                      Single source of truth. Only verified successful transactions appear here.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {confirmedLedger.length === 0 ? (
                  <EmptyState icon={<CheckCircle className="h-8 w-8" />} message="No confirmed entries" sub="Transactions must pass verification to appear here" />
                ) : (
                  <div className="overflow-x-auto -mx-6">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Cycle</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Amount</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">TX Ref</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">FLW TX ID</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Confirmed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {confirmedLedger.map(e => (
                          <TableRow key={e.id}>
                            <TableCell className="font-mono text-xs">{e.payment_cycle || '-'}</TableCell>
                            <TableCell className="font-medium text-xs text-green-700">₦{Number(e.amount).toLocaleString()}</TableCell>
                            <TableCell>
                              <code className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded max-w-[180px] truncate block">
                                {e.tx_ref}
                              </code>
                            </TableCell>
                            <TableCell><code className="text-[10px] text-muted-foreground">{e.flw_transaction_id || '—'}</code></TableCell>
                            <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {new Date(e.confirmed_at).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Webhook Logs Tab */}
          <TabsContent value="webhooks">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Audit Trail</CardTitle>
                <CardDescription className="text-xs">Webhook events, verification attempts, and state transitions.</CardDescription>
              </CardHeader>
              <CardContent>
                {webhookLogs.length === 0 ? (
                  <EmptyState icon={<FileText className="h-8 w-8" />} message="No events logged" sub="Events appear as charges and verifications occur" />
                ) : (
                  <div className="overflow-x-auto -mx-6">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Event</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">TX Ref</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Status</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Source</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Amount</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Processed</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {webhookLogs.map(w => (
                          <TableRow key={w.id}>
                            <TableCell>
                              <code className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded">{w.event_type}</code>
                            </TableCell>
                            <TableCell>
                              <code className="text-[10px] text-muted-foreground max-w-[120px] truncate block">
                                {w.tx_ref || '—'}
                              </code>
                            </TableCell>
                            <TableCell><StatusBadge status={w.status || '—'} /></TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] font-mono">{w.verification_source || '—'}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">{w.amount ? `₦${Number(w.amount).toLocaleString()}` : '—'}</TableCell>
                            <TableCell>
                              {w.processed ? (
                                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                              ) : (
                                <Clock className="h-3.5 w-3.5 text-yellow-600" />
                              )}
                            </TableCell>
                            <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {new Date(w.created_at).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* State Machine Legend */}
        <Card className="border-dashed">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="text-xs font-medium">Transaction State Model</p>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <StatusBadge status="initiated" />
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <StatusBadge status="pending" />
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <StatusBadge status="final_success" />
                  <span className="text-muted-foreground">/</span>
                  <StatusBadge status="final_failed" />
                  <span className="text-muted-foreground">/</span>
                  <StatusBadge status="unresolved" />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Only <strong>final_success</strong> creates a confirmed ledger entry. Pending transactions are verified via Flutterwave API every 2 minutes (cron). Transactions pending &gt;24h or exceeding retry limits are marked <strong>unresolved</strong> for manual review.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function EmptyState({ icon, message, sub }: { icon: React.ReactNode; message: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <div className="p-3 rounded-full bg-muted/30 mb-3">{icon}</div>
      <p className="text-sm font-medium">{message}</p>
      <p className="text-xs">{sub}</p>
    </div>
  );
}
