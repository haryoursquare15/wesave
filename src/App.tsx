import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route, useLocation, useNavigate, Navigate, useParams } from "react-router-dom";
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
import AdminLogin from "./pages/AdminLogin";
import SecuritySettings from "./pages/SecuritySettings";
import Settings from "./pages/Settings";
import Support from "./pages/Support";
import Crowdfunding from "./pages/Crowdfunding";
import GoalFunding from "./pages/GoalFunding";
import CreateGoalCampaign from "./pages/CreateGoalCampaign";
import GoalCampaignDetail from "./pages/GoalCampaignDetail";
import PublicCampaignPay from "./pages/PublicCampaignPay";
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
import SandboxForgotPassword from "./pages/SandboxForgotPassword";
import SandboxResetPassword from "./pages/SandboxResetPassword";
import SandboxInvite from "./pages/SandboxInvite";
import SandboxHealth from "./pages/SandboxHealth";
import { SandboxAuthProvider } from "./contexts/SandboxAuthContext";
import NotFound from "./pages/NotFound";
import Unsubscribe from "./pages/Unsubscribe";
import { ADMIN_BASE, ADMIN_LOGIN_PATH, ADMIN_CONSOLE_PATH, ADMIN_RECURRING_TEST_PATH } from "@/lib/adminRoutes";
import { APP_HOME, SIGN_IN, FORGOT_PASSWORD, RESET_PASSWORD, JOIN } from "@/lib/appRoutes";

const queryClient = new QueryClient();

const PUBLIC_ROUTES = ["/", "/auth", "/forgot-password", "/invite", "/onboarding", "/terms", "/privacy", "/aml-policy", "/kyc-policy", "/goal", "/delete-account", "/app-home", "/vfd-sandbox", "/vfd-sandbox/auth", "/unsubscribe", APP_HOME, SIGN_IN, FORGOT_PASSWORD, RESET_PASSWORD, JOIN, ADMIN_LOGIN_PATH];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(route =>
    pathname === route ||
    pathname.startsWith("/invite/") ||
    pathname.startsWith("/goal/") ||
    pathname.startsWith("/vfd-sandbox") ||
    pathname.startsWith(`${JOIN}/`) ||
    pathname.startsWith(`${APP_HOME}/`)
  );
}

/**
 * Redirect-only route for the legacy /vfd-sandbox/* paths. Preserves the
 * query string and the hash fragment (password-recovery links carry the
 * session in the hash — dropping it silently breaks the reset flow).
 */
function LegacyRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  const params = useParams();
  const target = `${params.token ? `${to}/${params.token}` : to}${search}${hash}`;

  // Belt and braces: Navigate swaps the rendered route, and replaceState makes
  // sure the address bar itself no longer shows the legacy path.
  useEffect(() => {
    if (window.location.pathname + window.location.search + window.location.hash !== target) {
      window.history.replaceState(window.history.state, "", target);
    }
  }, [target]);

  return <Navigate to={target} replace />;
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
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="vestara-theme">
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
                <Route path={ADMIN_LOGIN_PATH} element={<AdminLogin />} />
                <Route path={ADMIN_CONSOLE_PATH} element={<Admin />} />
                <Route path={ADMIN_RECURRING_TEST_PATH} element={<RecurringTestDashboard />} />
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
                <Route path="/goal/:slug" element={<PublicCampaignPay />} />
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
                <Route path="/unsubscribe" element={<Unsubscribe />} />
                <Route path={SIGN_IN} element={
                  <SandboxAuthProvider>
                    <SandboxAuth />
                  </SandboxAuthProvider>
                } />
                <Route path={FORGOT_PASSWORD} element={<SandboxForgotPassword />} />
                <Route path={RESET_PASSWORD} element={<SandboxResetPassword />} />
                <Route path={`${JOIN}/:token`} element={<SandboxInvite />} />
                <Route path={APP_HOME} element={<VfdSandbox />} />
                <Route path={`${ADMIN_BASE}/health`} element={<SandboxHealth />} />

                {/* Legacy paths — kept forever so old invite links, reset
                    emails and bookmarks never 404. */}
                <Route path="/vfd-sandbox/auth" element={<LegacyRedirect to={SIGN_IN} />} />
                <Route path="/vfd-sandbox/forgot-password" element={<LegacyRedirect to={FORGOT_PASSWORD} />} />
                <Route path="/vfd-sandbox/reset-password" element={<LegacyRedirect to={RESET_PASSWORD} />} />
                <Route path="/vfd-sandbox/invite/:token" element={<LegacyRedirect to={JOIN} />} />
                <Route path="/vfd-sandbox" element={<LegacyRedirect to={APP_HOME} />} />
                <Route path="/sandbox-health" element={<LegacyRedirect to={`${ADMIN_BASE}/health`} />} />
                <Route path="/admin" element={<LegacyRedirect to={ADMIN_CONSOLE_PATH} />} />
                <Route path="/admin/recurring-test" element={<LegacyRedirect to={ADMIN_RECURRING_TEST_PATH} />} />
                <Route path="/admin/login" element={<LegacyRedirect to={ADMIN_LOGIN_PATH} />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </OnboardingRedirect>
          </ProtectedRouteEnforcement>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
