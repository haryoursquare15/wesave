 import { useState, useEffect } from "react";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Skeleton } from "@/components/ui/skeleton";
 import { supabase } from "@/integrations/supabase/client";
 import { format } from "date-fns";
 import { Search, RefreshCw, Eye } from "lucide-react";
 import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
 
 interface AuditLog {
   id: string;
   user_id: string;
   action: string;
   resource_type: string;
   resource_id: string | null;
  details: any;
   ip_address: string | null;
   user_agent: string | null;
   created_at: string;
 }
 
 export function AuditLogsTab() {
   const [logs, setLogs] = useState<AuditLog[]>([]);
   const [loading, setLoading] = useState(true);
   const [search, setSearch] = useState("");
   const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
 
   const fetchLogs = async () => {
     setLoading(true);
     try {
       const { data, error } = await supabase
         .from("audit_logs")
         .select("*")
         .order("created_at", { ascending: false })
         .limit(200);
 
       if (error) throw error;
       setLogs(data || []);
     } catch (err) {
       console.error("Error fetching audit logs:", err);
     } finally {
       setLoading(false);
     }
   };
 
   useEffect(() => {
     fetchLogs();
   }, []);
 
   const filteredLogs = logs.filter(log => {
     const searchLower = search.toLowerCase();
     return (
       log.action.toLowerCase().includes(searchLower) ||
       log.resource_type.toLowerCase().includes(searchLower) ||
       log.user_id.toLowerCase().includes(searchLower)
     );
   });
 
   const getActionBadge = (action: string) => {
     if (action.includes("create") || action.includes("add")) {
       return <Badge className="bg-success/10 text-success">{action}</Badge>;
     }
     if (action.includes("delete") || action.includes("remove")) {
       return <Badge variant="destructive">{action}</Badge>;
     }
     if (action.includes("update") || action.includes("edit")) {
      return <Badge className="bg-primary/10 text-primary">{action}</Badge>;
     }
     if (action.includes("freeze") || action.includes("restrict")) {
      return <Badge className="bg-warning/10 text-warning">{action}</Badge>;
     }
     return <Badge variant="outline">{action}</Badge>;
   };
 
   return (
     <Card>
       <CardHeader>
         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
           <div>
             <CardTitle>Audit Logs</CardTitle>
             <CardDescription>Immutable record of all admin actions</CardDescription>
           </div>
           <Button variant="outline" size="sm" onClick={fetchLogs}>
             <RefreshCw className="h-4 w-4 mr-2" />
             Refresh
           </Button>
         </div>
       </CardHeader>
       <CardContent>
         <div className="mb-4">
           <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
             <Input
               placeholder="Search by action, resource type, user ID..."
               className="pl-9"
               value={search}
               onChange={(e) => setSearch(e.target.value)}
             />
           </div>
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
                   <TableHead>Timestamp</TableHead>
                   <TableHead>Action</TableHead>
                   <TableHead>Resource</TableHead>
                   <TableHead>User ID</TableHead>
                   <TableHead>IP Address</TableHead>
                   <TableHead>Details</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {filteredLogs.map((log) => (
                   <TableRow key={log.id}>
                     <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                       {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                     </TableCell>
                     <TableCell>{getActionBadge(log.action)}</TableCell>
                     <TableCell>
                       <div className="text-sm">
                         <span className="font-medium">{log.resource_type}</span>
                         {log.resource_id && (
                           <span className="text-muted-foreground ml-1">
                             ({log.resource_id.slice(0, 8)}...)
                           </span>
                         )}
                       </div>
                     </TableCell>
                     <TableCell className="font-mono text-xs">
                       {log.user_id.slice(0, 8)}...
                     </TableCell>
                     <TableCell className="text-sm text-muted-foreground">
                       {log.ip_address || "—"}
                     </TableCell>
                     <TableCell>
                       <Dialog>
                         <DialogTrigger asChild>
                           <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                             <Eye className="h-4 w-4" />
                           </Button>
                         </DialogTrigger>
                         {selectedLog?.id === log.id && (
                           <DialogContent className="max-w-lg">
                             <DialogHeader>
                               <DialogTitle>Audit Log Details</DialogTitle>
                               <DialogDescription>Full audit record</DialogDescription>
                             </DialogHeader>
                             <div className="space-y-3 text-sm">
                               <div className="grid grid-cols-2 gap-2">
                                 <div className="text-muted-foreground">ID:</div>
                                 <div className="font-mono text-xs">{log.id}</div>
                                 <div className="text-muted-foreground">User ID:</div>
                                 <div className="font-mono text-xs">{log.user_id}</div>
                                 <div className="text-muted-foreground">Action:</div>
                                 <div>{log.action}</div>
                                 <div className="text-muted-foreground">Resource:</div>
                                 <div>{log.resource_type}</div>
                                 <div className="text-muted-foreground">IP Address:</div>
                                 <div>{log.ip_address || "—"}</div>
                                 <div className="text-muted-foreground">Timestamp:</div>
                                 <div>{format(new Date(log.created_at), "PPpp")}</div>
                               </div>
                               {log.details && (
                                 <div>
                                   <div className="text-muted-foreground mb-1">Details:</div>
                                   <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-48">
                                     {JSON.stringify(log.details, null, 2)}
                                   </pre>
                                 </div>
                               )}
                               {log.user_agent && (
                                 <div>
                                   <div className="text-muted-foreground mb-1">User Agent:</div>
                                   <div className="text-xs text-muted-foreground break-all">
                                     {log.user_agent}
                                   </div>
                                 </div>
                               )}
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