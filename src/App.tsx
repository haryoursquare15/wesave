import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { useSessionEnforcement } from "@/hooks/useSessionEnforcement";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Groups from "./pages/Groups";
import CreateGroup from "./pages/CreateGroup";
import GroupDetail from "./pages/GroupDetail";
import Profile from "./pages/Profile";
import Wallet from "./pages/Wallet";
import Invite from "./pages/Invite";
import Admin from "./pages/Admin";
import SecuritySettings from "./pages/SecuritySettings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Wrapper component to apply session enforcement on protected routes
function SessionEnforcementWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const publicRoutes = ["/", "/auth", "/forgot-password", "/invite"];
  const isPublicRoute = publicRoutes.some(route => 
    location.pathname === route || location.pathname.startsWith("/invite/")
  );
  
  // Only enforce session on protected routes
  if (!isPublicRoute) {
    useSessionEnforcement();
  }
  
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <SessionEnforcementWrapper>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/create-group" element={<CreateGroup />} />
            <Route path="/groups/:groupId" element={<GroupDetail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/invite/:token" element={<Invite />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/settings/security" element={<SecuritySettings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SessionEnforcementWrapper>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
