import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  usePlatformBalance, 
  usePlatformLedger, 
  usePlatformSettlements,
  useFeeReport 
} from "@/hooks/usePlatformRevenue";
import { 
  Wallet, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  RefreshCw, 
  Send,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function PlatformRevenueTab() {
  const { toast } = useToast();
  const { balance, loading: balanceLoading, refetch: refetchBalance } = usePlatformBalance();
  const { entries, loading: ledgerLoading, refetch: refetchLedger } = usePlatformLedger();
  const { settlements, loading: settlementsLoading, refetch: refetchSettlements, triggerSettlement } = usePlatformSettlements();
  const { report, loading: reportLoading, refetch: refetchReport } = useFeeReport();
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    refetchBalance();
    refetchLedger();
    refetchSettlements();
    refetchReport();
  }, []);

  const handleRefresh = () => {
    refetchBalance();
    refetchLedger();
    refetchSettlements();
    refetchReport();
    toast({ title: "Refreshed", description: "Platform data refreshed" });
  };

  const handleTriggerSettlement = async () => {
    setSettling(true);
    try {
      const result = await triggerSettlement();
      
      if (result.skipped) {
        toast({
          title: "Settlement Skipped",
          description: result.reason || "Balance below minimum threshold",
        });
      } else {
        toast({
          title: "Settlement Initiated",
          description: `Successfully settled ₦${result.amount?.toLocaleString()} to platform account`,
        });
        // Refresh data after settlement
        refetchBalance();
        refetchLedger();
        refetchSettlements();
      }
    } catch (error) {
      toast({
        title: "Settlement Failed",
        description: error instanceof Error ? error.message : "Failed to trigger settlement",
        variant: "destructive",
      });
    } finally {
      setSettling(false);
    }
  };

  const getEntryTypeIcon = (type: string) => {
    switch (type) {
      case 'fee_collected':
        return <ArrowDownCircle className="h-4 w-4 text-green-500" />;
      case 'settlement':
        return <ArrowUpCircle className="h-4 w-4 text-blue-500" />;
      default:
        return <Wallet className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getSettlementStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'processing':
        return <Badge className="bg-yellow-500"><Clock className="h-3 w-3 mr-1" />Processing</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline"><AlertCircle className="h-3 w-3 mr-1" />{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform Wallet Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
            <Wallet className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {balanceLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-green-600">
                ₦{(balance?.available_balance || 0).toLocaleString()}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Ready to settle</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {balanceLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">
                ₦{(balance?.total_collected || 0).toLocaleString()}
              </div>
            )}
            <p className="text-xs text-muted-foreground">All-time fees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Effective Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {reportLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{report?.effective_rate || '2%'}</div>
            )}
            <p className="text-xs text-muted-foreground">Platform fee rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Last Settlement</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {balanceLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-lg font-medium">
                {balance?.last_settlement_at 
                  ? format(new Date(balance.last_settlement_at), "MMM d, HH:mm")
                  : "Never"
                }
              </div>
            )}
            <p className="text-xs text-muted-foreground">Auto-settles daily</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <Button variant="outline" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Data
        </Button>
        
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={settling || (balance?.available_balance || 0) < 1000}>
              <Send className="h-4 w-4 mr-2" />
              {settling ? "Processing..." : "Manual Settlement"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Trigger Manual Settlement?</AlertDialogTitle>
              <AlertDialogDescription>
                This will transfer ₦{(balance?.available_balance || 0).toLocaleString()} from the platform wallet 
                to the configured bank account. Minimum settlement amount is ₦1,000.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleTriggerSettlement}>
                Proceed with Settlement
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Ledger & Settlements Tabs */}
      <Tabs defaultValue="ledger" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ledger">Platform Ledger</TabsTrigger>
          <TabsTrigger value="settlements">Settlement History</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <Card>
            <CardHeader>
              <CardTitle>Platform Ledger</CardTitle>
              <CardDescription>All fee collections and settlements</CardDescription>
            </CardHeader>
            <CardContent>
              {ledgerLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : entries.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No ledger entries yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance Before</TableHead>
                        <TableHead className="text-right">Balance After</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getEntryTypeIcon(entry.entry_type)}
                              <span className="capitalize">{entry.entry_type.replace('_', ' ')}</span>
                            </div>
                          </TableCell>
                          <TableCell className={`text-right font-medium ${
                            entry.entry_type === 'fee_collected' ? 'text-green-600' : 'text-blue-600'
                          }`}>
                            {entry.entry_type === 'fee_collected' ? '+' : '-'}₦{entry.amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            ₦{entry.balance_before.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            ₦{entry.balance_after.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {entry.source_type || '—'}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" title={entry.description || undefined}>
                            {entry.description || '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(entry.created_at), "MMM d, HH:mm")}
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

        <TabsContent value="settlements">
          <Card>
            <CardHeader>
              <CardTitle>Settlement History</CardTitle>
              <CardDescription>Bank transfer records</CardDescription>
            </CardHeader>
            <CardContent>
              {settlementsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : settlements.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No settlements yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Bank</TableHead>
                        <TableHead>Initiated</TableHead>
                        <TableHead>Completed</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {settlements.map((settlement) => (
                        <TableRow key={settlement.id}>
                          <TableCell className="font-mono text-sm">
                            {settlement.flw_transfer_ref || settlement.id.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ₦{settlement.amount.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {getSettlementStatusBadge(settlement.status)}
                          </TableCell>
                          <TableCell>
                            {settlement.bank_name || '—'}
                            {settlement.bank_account && ` (****${settlement.bank_account})`}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(settlement.initiated_at), "MMM d, HH:mm")}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {settlement.completed_at 
                              ? format(new Date(settlement.completed_at), "MMM d, HH:mm")
                              : '—'
                            }
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate text-muted-foreground" 
                            title={settlement.failure_reason || undefined}>
                            {settlement.failure_reason || '—'}
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
    </div>
  );
}
