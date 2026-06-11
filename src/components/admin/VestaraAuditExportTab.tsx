import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { exportToCSV, exportToPDF } from "@/lib/exportUtils";
import { format } from "date-fns";
import { Download, Search, FileText, Loader2 } from "lucide-react";

type DatasetKey = "settlement" | "intra";

interface FilterState {
  accountNumber: string;
  userId: string;
  startDate: string; // yyyy-mm-dd
  endDate: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export function VestaraAuditExportTab() {
  const { toast } = useToast();
  const [tab, setTab] = useState<DatasetKey>("settlement");
  const [filters, setFilters] = useState<FilterState>({
    accountNumber: "",
    userId: "",
    startDate: daysAgoISO(30),
    endDate: todayISO(),
  });
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Record<string, any>[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const startISO = new Date(filters.startDate + "T00:00:00").toISOString();
      const endISO = new Date(filters.endDate + "T23:59:59").toISOString();

      if (tab === "settlement") {
        let q = supabase
          .from("vestara_settlement_balance_audit")
          .select("*")
          .gte("created_at", startISO)
          .lte("created_at", endISO)
          .order("created_at", { ascending: false })
          .limit(2000);
        if (filters.accountNumber) q = q.eq("account_number", filters.accountNumber.trim());
        if (filters.userId) q = q.eq("user_id", filters.userId.trim());
        const { data, error } = await q;
        if (error) throw error;
        setRows(data || []);
      } else {
        let q = supabase
          .from("intra_transfer_reports")
          .select("*")
          .gte("created_at", startISO)
          .lte("created_at", endISO)
          .order("created_at", { ascending: false })
          .limit(2000);
        if (filters.accountNumber) {
          const acct = filters.accountNumber.trim();
          q = q.or(`from_account.eq.${acct},to_account.eq.${acct}`);
        }
        if (filters.userId) {
          const uid = filters.userId.trim();
          q = q.or(`sender_user_id.eq.${uid},recipient_user_id.eq.${uid}`);
        }
        const { data, error } = await q;
        if (error) throw error;
        setRows(data || []);
      }
    } catch (err) {
      console.error(err);
      toast({
        title: "Failed to load audit data",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const flatten = (r: Record<string, any>) => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(r)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        out[k] = JSON.stringify(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  };

  const buildSubtitle = () => {
    const parts = [
      `Range: ${filters.startDate} → ${filters.endDate}`,
      filters.accountNumber ? `Account: ${filters.accountNumber}` : "",
      filters.userId ? `User: ${filters.userId}` : "",
      `Rows: ${rows.length}`,
      `Generated: ${format(new Date(), "yyyy-MM-dd HH:mm")}`,
    ].filter(Boolean);
    return parts.join("  |  ");
  };

  const doExport = (kind: "csv" | "pdf") => {
    if (!rows.length) {
      toast({ title: "Nothing to export", description: "Run a query first.", variant: "destructive" });
      return;
    }
    const filename = tab === "settlement" ? "vestara_settlement_audit" : "intra_transfer_report";
    const data = rows.map(flatten);
    if (kind === "csv") {
      exportToCSV(data, filename);
    } else {
      const title = tab === "settlement"
        ? "Vestara Settlement Balance Audit"
        : "Intra Transfer Report";
      exportToPDF(data, filename, { title, subtitle: buildSubtitle(), orientation: "l" });
    }
  };

  const previewColumns = tab === "settlement"
    ? ["created_at", "account_number", "event_type", "amount", "settlement_balance_after", "reference"]
    : ["created_at", "from_account", "to_account", "amount", "settlement_status", "reference"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Vestara Audit Trail Export
        </CardTitle>
        <CardDescription>
          Export settlement balance audit and intra-transfer reports per account and date range.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as DatasetKey); setRows([]); }}>
          <TabsList>
            <TabsTrigger value="settlement">Settlement Balance Audit</TabsTrigger>
            <TabsTrigger value="intra">Intra Transfer Reports</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="pt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label htmlFor="acct">Account number</Label>
                <Input
                  id="acct"
                  placeholder="e.g. 9871707899"
                  value={filters.accountNumber}
                  onChange={(e) => setFilters({ ...filters, accountNumber: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="uid">User ID (optional)</Label>
                <Input
                  id="uid"
                  placeholder="UUID"
                  value={filters.userId}
                  onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="start">From</Label>
                <Input
                  id="start"
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="end">To</Label>
                <Input
                  id="end"
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={fetchData} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Run query
              </Button>
              <Button variant="outline" onClick={() => doExport("csv")} disabled={!rows.length}>
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
              <Button variant="outline" onClick={() => doExport("pdf")} disabled={!rows.length}>
                <FileText className="h-4 w-4 mr-2" /> Export PDF
              </Button>
              <Badge variant="secondary" className="ml-auto self-center">
                {rows.length} row{rows.length === 1 ? "" : "s"}
              </Badge>
            </div>

            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {previewColumns.map((c) => (
                      <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={previewColumns.length} className="text-center text-muted-foreground py-8">
                        {loading ? "Loading…" : "No rows. Adjust filters and run query."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.slice(0, 50).map((r, i) => (
                      <TableRow key={r.id ?? i}>
                        {previewColumns.map((c) => (
                          <TableCell key={c} className="whitespace-nowrap text-xs">
                            {c === "created_at" && r[c]
                              ? format(new Date(r[c]), "yyyy-MM-dd HH:mm")
                              : c === "amount" || c.includes("balance")
                              ? r[c] != null ? `₦${Number(r[c]).toLocaleString()}` : "—"
                              : String(r[c] ?? "—")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {rows.length > 50 && (
                <div className="text-xs text-muted-foreground text-center py-2 border-t">
                  Showing first 50 of {rows.length}. Export to see all.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
