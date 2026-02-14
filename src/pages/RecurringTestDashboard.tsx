import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CreditCard, RefreshCw, Play, Trash2, Shield, Zap, FileText, BarChart3 } from "lucide-react";
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

interface TestLedgerEntry {
  id: string;
  user_id: string;
  group_id: string | null;
  amount: number;
  tx_ref: string;
  status: string;
  payment_cycle: number;
  retry_count: number;
  failure_reason: string | null;
  created_at: string;
}

interface WebhookLog {
  id: string;
  event_type: string;
  tx_ref: string | null;
  flw_ref: string | null;
  status: string | null;
  amount: number | null;
  processed: boolean;
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

export default function RecurringTestDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { toast } = useToast();

  const [tokens, setTokens] = useState<TestToken[]>([]);
  const [ledger, setLedger] = useState<TestLedgerEntry[]>([]);
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
        setLedger(resp.data.ledger || []);
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

  // Load Flutterwave inline JS SDK
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
        toast({ title: "Error", description: "Flutterwave SDK not loaded yet. Please try again in a moment.", variant: "destructive" });
        setActionLoading(null);
        return;
      }

      // Open Flutterwave payment modal
      window.FlutterwaveCheckout({
        public_key: config.public_key,
        tx_ref: config.tx_ref,
        amount: config.amount,
        currency: config.currency,
        customer: config.customer,
        customizations: config.customizations,
        meta: config.meta,
        payment_options: 'card',
        callback: async (response: Record<string, unknown>) => {
          console.log('Flutterwave callback:', response);
          // Verify and save token via edge function
          try {
            const verifyResp = await supabase.functions.invoke('recurring-test-charge', {
              body: {
                action: 'verify_and_save_token',
                transaction_id: response.transaction_id,
                tx_ref: response.tx_ref,
              },
            });

            if (verifyResp.data?.success) {
              toast({ title: "Token Saved!", description: verifyResp.data.message });
            } else {
              toast({ title: "Verification Issue", description: verifyResp.data?.error || 'Could not save token', variant: "destructive" });
            }
          } catch (err) {
            console.error('Token verification error:', err);
            toast({ title: "Error", description: "Failed to verify transaction", variant: "destructive" });
          }
          fetchData();
          setActionLoading(null);
        },
        onclose: () => {
          setActionLoading(null);
        },
      });
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
      toast({ title: "Error", description: 'Reset failed', variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Skeleton className="h-12 w-64 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const statusColor = (s: string) => {
    if (s === 'successful' || s === 'success') return 'bg-green-100 text-green-800';
    if (s === 'failed') return 'bg-red-100 text-red-800';
    if (s === 'pending') return 'bg-yellow-100 text-yellow-800';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">Recurring Charge Test Lab</h1>
              <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                TEST MODE
              </Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button variant="destructive" size="sm" onClick={resetTestData} disabled={actionLoading === 'reset'}>
              <Trash2 className="h-4 w-4 mr-1" /> Reset All
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Saved Tokens</CardDescription>
              <CardTitle className="text-3xl">{tokens.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Ledger Entries</CardDescription>
              <CardTitle className="text-3xl">{ledger.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Successful Charges</CardDescription>
              <CardTitle className="text-3xl text-green-600">{ledger.filter(l => l.status === 'successful').length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Failed Charges</CardDescription>
              <CardTitle className="text-3xl text-red-600">{ledger.filter(l => l.status === 'failed').length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Initiate First Payment */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> Step 1: Generate Card Token</CardTitle>
            <CardDescription>Initiate a first payment to capture the card token via Flutterwave test mode.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={initiateTestPayment} disabled={actionLoading === 'initiate'}>
              <Zap className="h-4 w-4 mr-2" />
              {actionLoading === 'initiate' ? 'Initializing...' : 'Initiate Test Payment (₦1,000)'}
            </Button>
            <p className="text-sm text-muted-foreground mt-2">
              Use Flutterwave test card: 5531 8866 5214 2950, CVV: 564, Expiry: 09/32, PIN: 3310, OTP: 12345
            </p>
          </CardContent>
        </Card>

        <Tabs defaultValue="tokens" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tokens" className="flex items-center gap-1">
              <CreditCard className="h-4 w-4" /> Tokens
            </TabsTrigger>
            <TabsTrigger value="ledger" className="flex items-center gap-1">
              <BarChart3 className="h-4 w-4" /> Test Ledger
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="flex items-center gap-1">
              <FileText className="h-4 w-4" /> Webhook Logs
            </TabsTrigger>
          </TabsList>

          {/* Tokens Tab */}
          <TabsContent value="tokens">
            <Card>
              <CardHeader>
                <CardTitle>Stored Test Tokens</CardTitle>
                <CardDescription>Card tokens captured from test payments. Use these for recurring charges.</CardDescription>
              </CardHeader>
              <CardContent>
                {tokens.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No tokens yet. Complete a test payment first.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Card</TableHead>
                        <TableHead>Token (masked)</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tokens.map(t => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono">{t.first_6digits || '******'}...{t.last_4digits || '****'}</TableCell>
                          <TableCell className="font-mono text-xs">{t.card_token.slice(0, 12)}...</TableCell>
                          <TableCell>{t.card_type || '-'}</TableCell>
                          <TableCell>{t.expiry || '-'}</TableCell>
                          <TableCell><Badge variant={t.is_active ? 'default' : 'secondary'}>{t.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                          <TableCell className="text-xs">{new Date(t.created_at).toLocaleString()}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() => runRecurringCharge(t.id)}
                              disabled={actionLoading === `charge-${t.id}` || !t.is_active}
                            >
                              <Play className="h-3 w-3 mr-1" />
                              {actionLoading === `charge-${t.id}` ? 'Charging...' : 'Charge ₦1,000'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ledger Tab */}
          <TabsContent value="ledger">
            <Card>
              <CardHeader>
                <CardTitle>Test Ledger</CardTitle>
                <CardDescription>All recurring charge attempts and their status. Updated only after webhook confirmation.</CardDescription>
              </CardHeader>
              <CardContent>
                {ledger.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No ledger entries yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cycle</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>TX Ref</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Retries</TableHead>
                        <TableHead>Failure Reason</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledger.map(l => (
                        <TableRow key={l.id}>
                          <TableCell>{l.payment_cycle}</TableCell>
                          <TableCell>₦{Number(l.amount).toLocaleString()}</TableCell>
                          <TableCell className="font-mono text-xs max-w-[200px] truncate">{l.tx_ref}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(l.status)}`}>
                              {l.status}
                            </span>
                          </TableCell>
                          <TableCell>{l.retry_count}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{l.failure_reason || '-'}</TableCell>
                          <TableCell className="text-xs">{new Date(l.created_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Webhook Logs Tab */}
          <TabsContent value="webhooks">
            <Card>
              <CardHeader>
                <CardTitle>Webhook Logs</CardTitle>
                <CardDescription>Raw webhook events received from Flutterwave test mode.</CardDescription>
              </CardHeader>
              <CardContent>
                {webhookLogs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No webhook events yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>TX Ref</TableHead>
                        <TableHead>FLW Ref</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Processed</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {webhookLogs.map(w => (
                        <TableRow key={w.id}>
                          <TableCell>{w.event_type}</TableCell>
                          <TableCell className="font-mono text-xs max-w-[180px] truncate">{w.tx_ref || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">{w.flw_ref || '-'}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(w.status || '')}`}>
                              {w.status || '-'}
                            </span>
                          </TableCell>
                          <TableCell>{w.amount ? `₦${Number(w.amount).toLocaleString()}` : '-'}</TableCell>
                          <TableCell><Badge variant={w.processed ? 'default' : 'outline'}>{w.processed ? 'Yes' : 'No'}</Badge></TableCell>
                          <TableCell className="text-xs">{new Date(w.created_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
