 import { useState } from "react";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Skeleton } from "@/components/ui/skeleton";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
 import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
 import { useAdminUsers, useAdminRoles } from "@/hooks/useAdmin";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { Database } from "@/integrations/supabase/types";
 import { useToast } from "@/hooks/use-toast";
 import { supabase } from "@/integrations/supabase/client";
 import { format } from "date-fns";
 import { Search, Eye, Snowflake, KeyRound, LogOut, AlertTriangle, Shield } from "lucide-react";
 import { adminActionReasonSchema, validateInput } from "@/lib/validation";
 
type AppRole = Database["public"]["Enums"]["app_role"];

 interface UserActionsDialogProps {
   user: {
     id: string;
     email: string | null;
     full_name: string | null;
     username: string | null;
   };
   onClose: () => void;
   onAction: () => void;
 }
 
 function UserActionsDialog({ user, onClose, onAction }: UserActionsDialogProps) {
   const [loading, setLoading] = useState(false);
   const [action, setAction] = useState<string | null>(null);
   const [reason, setReason] = useState("");
   const { toast } = useToast();
   const { hasPermission } = useAdminPermissions();
 
    const handleAction = async () => {
      if (!action) return;
      
      // Validate reason input if provided
      if (reason) {
        const validation = validateInput(adminActionReasonSchema, reason);
        if (validation.success === false) {
          toast({ title: "Validation Error", description: validation.error, variant: "destructive" });
          return;
        }
      }
      
      setLoading(true);
      
      try {
        // Sanitize the reason
        const sanitizedReason = reason.trim().slice(0, 500);
        
        // Log the action in audit_logs
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          action: action,
          resource_type: "user",
          resource_id: user.id,
          details: { reason: sanitizedReason, target_email: user.email },
        });
  
        switch (action) {
          case "freeze":
            await supabase.from("profiles").update({
              account_status: "frozen",
              frozen_at: new Date().toISOString(),
              freeze_reason: sanitizedReason,
            }).eq("id", user.id);
            toast({ title: "User Frozen", description: `${user.full_name || user.email}'s account has been frozen.` });
            break;
          case "unfreeze":
            await supabase.from("profiles").update({
              account_status: "active",
              frozen_at: null,
              frozen_by: null,
              freeze_reason: null,
            }).eq("id", user.id);
            toast({ title: "User Unfrozen", description: `${user.full_name || user.email}'s account has been unfrozen.` });
            break;
          case "flag_risk":
            await supabase.from("profiles").update({
              risk_level: "high",
            }).eq("id", user.id);
            toast({ title: "User Flagged", description: `${user.full_name || user.email} has been flagged for risk review.` });
            break;
          default:
            break;
        }
  
        onAction();
        onClose();
      } catch (err) {
        console.error("Action error:", err);
        toast({ title: "Error", description: "Failed to perform action.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
 
   return (
     <DialogContent>
       <DialogHeader>
         <DialogTitle>User Actions</DialogTitle>
         <DialogDescription>
           Manage {user.full_name || user.email}
         </DialogDescription>
       </DialogHeader>
 
       <div className="space-y-4 py-4">
         <div className="grid grid-cols-2 gap-2">
           {hasPermission("users.freeze") && (
             <>
               <Button
                 variant={action === "freeze" ? "default" : "outline"}
                 size="sm"
                 onClick={() => setAction("freeze")}
                 className="flex items-center gap-2"
               >
                 <Snowflake className="h-4 w-4" />
                 Freeze Account
               </Button>
               <Button
                 variant={action === "unfreeze" ? "default" : "outline"}
                 size="sm"
                 onClick={() => setAction("unfreeze")}
                 className="flex items-center gap-2"
               >
                 <Snowflake className="h-4 w-4" />
                 Unfreeze
               </Button>
             </>
           )}
           {hasPermission("compliance.restrict") && (
             <Button
               variant={action === "flag_risk" ? "destructive" : "outline"}
               size="sm"
               onClick={() => setAction("flag_risk")}
               className="flex items-center gap-2"
             >
               <AlertTriangle className="h-4 w-4" />
               Flag for Risk
             </Button>
           )}
         </div>
 
         {action && (
           <div className="space-y-2">
             <label className="text-sm font-medium">Reason</label>
             <Input
               placeholder="Enter reason for this action..."
               value={reason}
               onChange={(e) => setReason(e.target.value)}
             />
           </div>
         )}
       </div>
 
       <DialogFooter>
         <Button variant="outline" onClick={onClose}>Cancel</Button>
         <Button onClick={handleAction} disabled={!action || loading}>
           {loading ? "Processing..." : "Confirm Action"}
         </Button>
       </DialogFooter>
     </DialogContent>
   );
 }
 
 export function UserManagementTab() {
   const [search, setSearch] = useState("");
   const [selectedUser, setSelectedUser] = useState<any>(null);
   const { users, loading, refetch } = useAdminUsers();
   const { assignRole, removeRole, loading: roleLoading } = useAdminRoles();
   const { hasPermission } = useAdminPermissions();
   const { toast } = useToast();
 
   const filteredUsers = users.filter(user => {
     const searchLower = search.toLowerCase();
     return (
       user.full_name?.toLowerCase().includes(searchLower) ||
       user.email?.toLowerCase().includes(searchLower) ||
       user.username?.toLowerCase().includes(searchLower) ||
       user.id.toLowerCase().includes(searchLower)
     );
   });
 
   const handleRoleChange = async (userId: string, newRole: string, currentRole: string | null) => {
     if (!hasPermission("roles.manage")) {
       toast({ title: "Permission Denied", variant: "destructive" });
       return;
     }
 
     try {
       if (currentRole) {
        await removeRole(userId, currentRole as AppRole);
       }
       if (newRole !== "none") {
        await assignRole(userId, newRole as AppRole);
       }
       toast({ title: "Role Updated", description: "User role has been updated successfully." });
       refetch();
     } catch (error) {
       toast({ title: "Error", description: "Failed to update user role.", variant: "destructive" });
     }
   };
 
   return (
     <Card>
       <CardHeader>
         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
           <div>
             <CardTitle>User Management</CardTitle>
             <CardDescription>Search and manage user accounts</CardDescription>
           </div>
           <div className="relative w-full sm:w-72">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
             <Input
               placeholder="Search by name, email, username..."
               className="pl-9"
               value={search}
               onChange={(e) => setSearch(e.target.value)}
             />
           </div>
         </div>
       </CardHeader>
       <CardContent>
         {loading ? (
           <div className="space-y-2">
             {[1, 2, 3].map((i) => (
               <Skeleton key={i} className="h-12 w-full" />
             ))}
           </div>
         ) : (
           <div className="overflow-x-auto">
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead>User</TableHead>
                   <TableHead>Username</TableHead>
                   <TableHead>Tier</TableHead>
                   <TableHead>Credit Score</TableHead>
                   <TableHead>Role</TableHead>
                   <TableHead>Joined</TableHead>
                   <TableHead>Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {filteredUsers.map((user) => (
                   <TableRow key={user.id}>
                     <TableCell>
                       <div>
                         <div className="font-medium">{user.full_name || "—"}</div>
                         <div className="text-xs text-muted-foreground">{user.email}</div>
                       </div>
                     </TableCell>
                     <TableCell>@{user.username || "—"}</TableCell>
                     <TableCell>
                       <Badge variant="outline" className="capitalize">
                         {user.membership_tier}
                       </Badge>
                     </TableCell>
                     <TableCell>{user.credit_score || 0}</TableCell>
                     <TableCell>
                       {hasPermission("roles.manage") ? (
                         <Select
                           value={user.role || "none"}
                           onValueChange={(value) => handleRoleChange(user.id, value, user.role)}
                           disabled={roleLoading}
                         >
                           <SelectTrigger className="w-36">
                             <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                             <SelectItem value="none">No Role</SelectItem>
                             <SelectItem value="user">User</SelectItem>
                             <SelectItem value="moderator">Moderator</SelectItem>
                             <SelectItem value="support_officer">Support Officer</SelectItem>
                             <SelectItem value="finance_admin">Finance Admin</SelectItem>
                             <SelectItem value="operations_admin">Operations Admin</SelectItem>
                             <SelectItem value="compliance_admin">Compliance Admin</SelectItem>
                             <SelectItem value="admin">Admin</SelectItem>
                             <SelectItem value="super_admin">Super Admin</SelectItem>
                           </SelectContent>
                         </Select>
                       ) : (
                         <Badge variant="secondary" className="capitalize">
                           {user.role || "none"}
                         </Badge>
                       )}
                     </TableCell>
                     <TableCell className="text-muted-foreground text-sm">
                       {user.created_at ? format(new Date(user.created_at), "MMM d, yyyy") : "—"}
                     </TableCell>
                     <TableCell>
                       <Dialog>
                         <DialogTrigger asChild>
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={() => setSelectedUser(user)}
                           >
                             <Shield className="h-4 w-4 mr-1" />
                             Actions
                           </Button>
                         </DialogTrigger>
                         {selectedUser?.id === user.id && (
                           <UserActionsDialog
                             user={user}
                             onClose={() => setSelectedUser(null)}
                             onAction={refetch}
                           />
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