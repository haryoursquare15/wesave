 import { useState, useEffect } from "react";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Skeleton } from "@/components/ui/skeleton";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
 import { supabase } from "@/integrations/supabase/client";
 import { format } from "date-fns";
 import { Search, RefreshCw, Eye } from "lucide-react";
 import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
 
import { Database } from "@/integrations/supabase/types";

type TransactionType = Database["public"]["Enums"]["transaction_type"];
type TransactionStatus = Database["public"]["Enums"]["transaction_status"];

 interface Transaction {
   id: string;
   user_id: string;
   type: string;
   amount: number;
   status: string;
   reference: string | null;
   description: string | null;
   created_at: string;
   group_id: string | null;
 }
 
 export function TransactionExplorerTab() {
   const [transactions, setTransactions] = useState<Transaction[]>([]);
   const [loading, setLoading] = useState(true);
   const [search, setSearch] = useState("");
   const [typeFilter, setTypeFilter] = useState<string>("all");
   const [statusFilter, setStatusFilter] = useState<string>("all");
   const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
 
   const fetchTransactions = async () => {
     setLoading(true);
     try {
       let query = supabase
         .from("transactions")
         .select("*")
         .order("created_at", { ascending: false })
         .limit(100);
 
       if (typeFilter !== "all") {
        query = query.eq("type", typeFilter as TransactionType);
       }
       if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as TransactionStatus);
       }
 
       const { data, error } = await query;
       if (error) throw error;
       setTransactions(data || []);
     } catch (err) {
       console.error("Error fetching transactions:", err);
     } finally {
       setLoading(false);
     }
   };
 
   useEffect(() => {
     fetchTransactions();
   }, [typeFilter, statusFilter]);
 
   const filteredTransactions = transactions.filter(tx => {
     const searchLower = search.toLowerCase();
     return (
       tx.reference?.toLowerCase().includes(searchLower) ||
       tx.user_id.toLowerCase().includes(searchLower) ||
       tx.description?.toLowerCase().includes(searchLower)
     );
   });
 
   const getStatusBadge = (status: string) => {
     switch (status) {
       case "completed":
         return <Badge className="bg-success/10 text-success border-success/20">Completed</Badge>;
       case "pending":
         return <Badge variant="outline" className="text-warning border-warning/50">Pending</Badge>;
       case "failed":
         return <Badge variant="destructive">Failed</Badge>;
       default:
         return <Badge variant="secondary">{status}</Badge>;
     }
   };
 
   const getTypeBadge = (type: string) => {
     const colors: Record<string, string> = {
       contribution: "bg-blue-500/10 text-blue-600 border-blue-500/20",
       payout: "bg-green-500/10 text-green-600 border-green-500/20",
       funding: "bg-purple-500/10 text-purple-600 border-purple-500/20",
       withdrawal: "bg-orange-500/10 text-orange-600 border-orange-500/20",
       service_fee: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
     };
     return <Badge className={colors[type] || ""}>{type}</Badge>;
   };
 
   return (
     <Card>
       <CardHeader>
         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
           <div>
             <CardTitle>Transaction Explorer</CardTitle>
             <CardDescription>View and filter all platform transactions</CardDescription>
           </div>
           <Button variant="outline" size="sm" onClick={fetchTransactions}>
             <RefreshCw className="h-4 w-4 mr-2" />
             Refresh
           </Button>
         </div>
       </CardHeader>
       <CardContent>
         {/* Filters */}
         <div className="flex flex-col sm:flex-row gap-3 mb-4">
           <div className="relative flex-1">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
             <Input
               placeholder="Search by reference, user ID..."
               className="pl-9"
               value={search}
               onChange={(e) => setSearch(e.target.value)}
             />
           </div>
           <Select value={typeFilter} onValueChange={setTypeFilter}>
             <SelectTrigger className="w-40">
               <SelectValue placeholder="Type" />
             </SelectTrigger>
             <SelectContent>
               <SelectItem value="all">All Types</SelectItem>
               <SelectItem value="contribution">Contribution</SelectItem>
               <SelectItem value="payout">Payout</SelectItem>
               <SelectItem value="funding">Funding</SelectItem>
               <SelectItem value="withdrawal">Withdrawal</SelectItem>
               <SelectItem value="service_fee">Service Fee</SelectItem>
             </SelectContent>
           </Select>
           <Select value={statusFilter} onValueChange={setStatusFilter}>
             <SelectTrigger className="w-40">
               <SelectValue placeholder="Status" />
             </SelectTrigger>
             <SelectContent>
               <SelectItem value="all">All Status</SelectItem>
               <SelectItem value="completed">Completed</SelectItem>
               <SelectItem value="pending">Pending</SelectItem>
               <SelectItem value="failed">Failed</SelectItem>
             </SelectContent>
           </Select>
         </div>
 
         {loading ? (
           <div className="space-y-2">
             {[1, 2, 3, 4, 5].map((i) => (
               <Skeleton key={i} className="h-12 w-full" />
             ))}
           </div>
         ) : (
           <div className="overflow-x-auto">
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead>Reference</TableHead>
                   <TableHead>Type</TableHead>
                   <TableHead>Amount</TableHead>
                   <TableHead>Status</TableHead>
                   <TableHead>Description</TableHead>
                   <TableHead>Date</TableHead>
                   <TableHead>Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {filteredTransactions.map((tx) => (
                   <TableRow key={tx.id}>
                     <TableCell className="font-mono text-xs">
                       {tx.reference?.slice(0, 12) || tx.id.slice(0, 8)}...
                     </TableCell>
                     <TableCell>{getTypeBadge(tx.type)}</TableCell>
                     <TableCell className="font-medium">
                       ₦{tx.amount.toLocaleString()}
                     </TableCell>
                     <TableCell>{getStatusBadge(tx.status)}</TableCell>
                     <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                       {tx.description || "—"}
                     </TableCell>
                     <TableCell className="text-sm text-muted-foreground">
                       {format(new Date(tx.created_at), "MMM d, HH:mm")}
                     </TableCell>
                     <TableCell>
                       <Dialog>
                         <DialogTrigger asChild>
                           <Button variant="ghost" size="sm" onClick={() => setSelectedTx(tx)}>
                             <Eye className="h-4 w-4" />
                           </Button>
                         </DialogTrigger>
                         {selectedTx?.id === tx.id && (
                           <DialogContent>
                             <DialogHeader>
                               <DialogTitle>Transaction Details</DialogTitle>
                               <DialogDescription>Full transaction information</DialogDescription>
                             </DialogHeader>
                             <div className="space-y-3 text-sm">
                               <div className="grid grid-cols-2 gap-2">
                                 <div className="text-muted-foreground">ID:</div>
                                 <div className="font-mono text-xs">{tx.id}</div>
                                 <div className="text-muted-foreground">Reference:</div>
                                 <div className="font-mono text-xs">{tx.reference || "—"}</div>
                                 <div className="text-muted-foreground">User ID:</div>
                                 <div className="font-mono text-xs">{tx.user_id}</div>
                                 <div className="text-muted-foreground">Type:</div>
                                 <div>{tx.type}</div>
                                 <div className="text-muted-foreground">Amount:</div>
                                 <div className="font-bold">₦{tx.amount.toLocaleString()}</div>
                                 <div className="text-muted-foreground">Status:</div>
                                 <div>{getStatusBadge(tx.status)}</div>
                                 <div className="text-muted-foreground">Description:</div>
                                 <div>{tx.description || "—"}</div>
                                 <div className="text-muted-foreground">Created:</div>
                                 <div>{format(new Date(tx.created_at), "PPpp")}</div>
                               </div>
                             </div>
                           </DialogContent>
                         )}
                       </Dialog>
                     </TableCell>
                   </TableRow>
                 ))}
               </TableBody>
             </Table>
           </div>
         )}
       </CardContent>
     </Card>
   );
 }