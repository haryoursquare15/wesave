import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useSessionEnforcement } from "@/hooks/useSessionEnforcement";
import { useEffect } from "react";
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
import Settings from "./pages/Settings";
import Support from "./pages/Support";
import Crowdfunding from "./pages/Crowdfunding";
import GoalFunding from "./pages/GoalFunding";
import CreateGoalCampaign from "./pages/CreateGoalCampaign";
import GoalCampaignDetail from "./pages/GoalCampaignDetail";
import TargetAjo from "./pages/TargetAjo";
import CreateTargetAjo from "./pages/CreateTargetAjo";
import TargetAjoDetail from "./pages/TargetAjoDetail";
import Associations from "./pages/Associations";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import AmlPolicy from "./pages/AmlPolicy";
import KycPolicy from "./pages/KycPolicy";
import RecurringTestDashboard from "./pages/RecurringTestDashboard";
import Referrals from "./pages/Referrals";
import SplitPay from "./pages/SplitPay";
import CreateSplitPay from "./pages/CreateSplitPay";
import SplitPayDetail from "./pages/SplitPayDetail";
import DeleteAccount from "./pages/DeleteAccount";
import AppHome from "./pages/AppHome";
import VfdSandbox from "./pages/VfdSandbox";
import SandboxAuth from "./pages/SandboxAuth";
import SandboxInvite from "./pages/SandboxInvite";
import SandboxHealth from "./pages/SandboxHealth";
import { SandboxAuthProvider } from "./contexts/SandboxAuthContext";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const PUBLIC_ROUTES = ["/", "/auth", "/forgot-password", "/invite", "/onboarding", "/terms", "/privacy", "/aml-policy", "/kyc-policy", "/goal", "/delete-account", "/app-home", "/vfd-sandbox", "/vfd-sandbox/auth"];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(route => 
    pathname === route || pathname.startsWith("/invite/") || pathname.startsWith("/goal/") || pathname.startsWith("/vfd-sandbox")
  );
}

// Session enforcement wrapper - only runs hook on protected routes
function ProtectedRouteEnforcement({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isPublic = isPublicRoute(location.pathname);
  
  // Always call the hook, but it will be a no-op on public routes
  useSessionEnforcement({ enabled: !isPublic });
  
  return <>{children}</>;
}

// Onboarding redirect wrapper
function OnboardingRedirect({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, loading, isOnboardingComplete } = useAuth();
  const isPublic = isPublicRoute(location.pathname);

  useEffect(() => {
    // Skip if still loading or on public route
    if (loading || isPublic) return;
    
    // Skip if already on onboarding
    if (location.pathname === "/onboarding") return;
    
    // Only redirect if we have a user and profile loaded, and onboarding is not complete
    if (user && profile !== null && !isOnboardingComplete) {
      navigate("/onboarding");
    }
  }, [user, profile, loading, isOnboardingComplete, isPublic, location.pathname, navigate]);

  return <>{children}</>;
}

const App = () => {
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      // Prevent blank-screen issues from unhandled async errors in event handlers
      // (these bypass React error boundaries)
      console.error("Unhandled promise rejection:", event.reason);
      event.preventDefault();
    };

    window.addEventListener("unhandledrejection", handleRejection);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <ProtectedRouteEnforcement>
            <OnboardingRedirect>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/app-home" element={<AppHome />} />
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
                <Route path="/admin/recurring-test" element={<RecurringTestDashboard />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/security" element={<SecuritySettings />} />
                <Route path="/settings/profile" element={<Profile />} />
                <Route path="/settings/payments" element={<Wallet />} />
                <Route path="/settings/notifications" element={<Settings />} />
                <Route path="/support/new" element={<Support />} />
                <Route path="/help" element={<Support />} />
                <Route path="/crowdfunding" element={<Crowdfunding />} />
                <Route path="/goal-funding" element={<GoalFunding />} />
                <Route path="/goal-funding/create" element={<CreateGoalCampaign />} />
                <Route path="/goal-funding/:campaignId" element={<GoalCampaignDetail />} />
                <Route path="/target-ajo" element={<TargetAjo />} />
                <Route path="/target-ajo/create" element={<CreateTargetAjo />} />
                <Route path="/target-ajo/:groupId" element={<TargetAjoDetail />} />
                <Route path="/associations" element={<Associations />} />
                <Route path="/referrals" element={<Referrals />} />
                <Route path="/split-pay" element={<SplitPay />} />
                <Route path="/split-pay/create" element={<CreateSplitPay />} />
                <Route path="/split-pay/:requestId" element={<SplitPayDetail />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/aml-policy" element={<AmlPolicy />} />
                <Route path="/kyc-policy" element={<KycPolicy />} />
                <Route path="/delete-account" element={<DeleteAccount />} />
                <Route path="/vfd-sandbox/auth" element={
                  <SandboxAuthProvider>
                    <SandboxAuth />
                  </SandboxAuthProvider>
                } />
                <Route path="/vfd-sandbox/invite/:token" element={<SandboxInvite />} />
                <Route path="/vfd-sandbox" element={<VfdSandbox />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </OnboardingRedirect>
          </ProtectedRouteEnforcement>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
