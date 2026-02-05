 import { useState, useEffect, useCallback } from "react";
 import { supabase } from "@/integrations/supabase/client";
 import { useAuth } from "@/contexts/AuthContext";
 
 export type AdminRole = 
   | "admin" 
   | "super_admin" 
   | "operations_admin" 
   | "support_officer" 
   | "finance_admin" 
   | "compliance_admin";
 
 export type Permission = 
   | "users.view" | "users.edit" | "users.freeze" | "users.reset_2fa"
   | "wallets.view" | "wallets.freeze"
   | "groups.view" | "groups.pause" | "groups.resolve_disputes"
   | "associations.view" | "associations.manage"
   | "crowdfunding.view" | "crowdfunding.manage"
   | "transactions.view" | "transactions.retry"
   | "revenue.view" | "revenue.settle"
   | "requests.view" | "requests.approve"
   | "support.view" | "support.resolve"
   | "compliance.view" | "compliance.restrict"
   | "analytics.view" | "analytics.export"
   | "audit.view" | "roles.manage";
 
 interface UseAdminPermissionsResult {
   isAnyAdmin: boolean;
   userRoles: AdminRole[];
   permissions: Permission[];
   hasPermission: (permission: Permission) => boolean;
   loading: boolean;
 }
 
 export function useAdminPermissions(): UseAdminPermissionsResult {
   const { user } = useAuth();
   const [isAnyAdmin, setIsAnyAdmin] = useState(false);
   const [userRoles, setUserRoles] = useState<AdminRole[]>([]);
   const [permissions, setPermissions] = useState<Permission[]>([]);
   const [loading, setLoading] = useState(true);
 
   useEffect(() => {
     async function fetchPermissions() {
       if (!user) {
         setIsAnyAdmin(false);
         setUserRoles([]);
         setPermissions([]);
         setLoading(false);
         return;
       }
 
       try {
         // Check if user is any admin
         const { data: isAdmin } = await supabase.rpc("is_any_admin", { _user_id: user.id });
         setIsAnyAdmin(isAdmin === true);
 
         if (isAdmin) {
           // Fetch user roles
           const { data: roles } = await supabase
             .from("user_roles")
             .select("role")
             .eq("user_id", user.id);
 
           const rolesList = (roles || []).map(r => r.role as AdminRole);
           setUserRoles(rolesList);
 
           // Fetch permissions for user's roles
           const { data: perms } = await supabase
             .from("admin_permissions")
             .select("permission")
             .in("role", rolesList);
 
           const permsList = [...new Set((perms || []).map(p => p.permission as Permission))];
           setPermissions(permsList);
         }
       } catch (err) {
         console.error("Error fetching admin permissions:", err);
       } finally {
         setLoading(false);
       }
     }
 
     fetchPermissions();
   }, [user]);
 
   const hasPermission = useCallback((permission: Permission) => {
     return permissions.includes(permission);
   }, [permissions]);
 
   return { isAnyAdmin, userRoles, permissions, hasPermission, loading };
 }