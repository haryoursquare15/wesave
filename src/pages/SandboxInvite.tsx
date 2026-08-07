import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, Calendar, DollarSign, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSandboxAuth } from "@/contexts/SandboxAuthContext";
import { SandboxAuthProvider } from "@/contexts/SandboxAuthContext";
import { SandboxModeContext } from "@/hooks/useSandboxAwareAuth";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { toast } from "sonner";

import { getUserFriendlyError } from "@/lib/errorMessages";
interface InviteValidation {
  valid: boolean;
  error_message?: string;
  group?: {
    id: string;
    name: string;
    contribution_amount: number;
    period: string;
    max_members: number;
    member_count: number;
    status: string;
  };
  admin_name?: string;
}

function SandboxInviteInner() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useSandboxAuth();
  const products = useVfdSandboxProducts();
  const [validation, setValidation] = useState<InviteValidation | null>(null);
  const [validating, setValidating] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!token) return;
    products.validateGroupInviteLink(token).then((res) => {
      setValidation((res?.data as InviteValidation) ?? { valid: false, error_message: "Invalid invite link" });
      setValidating(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleJoin = async () => {
    if (!user) {
      sessionStorage.setItem("pending_sandbox_invite_token", token || "");
      navigate("/vfd-sandbox/auth");
      return;
    }
    setJoining(true);
    const res = await products.joinGroupViaLink(token!);
    if (res?.error) {
      toast.error(getUserFriendlyError(res.error));
      setJoining(false);
      return;
    }
    setJoined(true);
    toast.success("You've joined the group!");
    setTimeout(() => navigate("/vfd-sandbox"), 1500);
  };

  if (authLoading || validating) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Validating invitation...</p>
        </div>
      </div>
    );
  }

  if (!validation?.valid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">Invalid Invitation</h2>
            <p className="text-muted-foreground mb-6">
              {validation?.error_message || "This invitation link is invalid or has expired."}
            </p>
            <Button onClick={() => navigate("/vfd-sandbox")} className="w-full">
              Go to Vestara
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">Welcome to the Group!</h2>
            <p className="text-muted-foreground">Taking you to your dashboard...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const group = validation.group!;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">You've been invited to join</p>
              <h1 className="text-2xl font-bold text-foreground">{group.name}</h1>
              {validation.admin_name && (
                <p className="text-xs text-muted-foreground mt-1">by {validation.admin_name}</p>
              )}
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4" /> Contribution
                </span>
                <span className="font-semibold text-foreground">
                  ₦{Number(group.contribution_amount).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" /> Frequency
                </span>
                <span className="font-semibold text-foreground capitalize">{group.period}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" /> Members
                </span>
                <span className="font-semibold text-foreground">
                  {group.member_count}/{group.max_members}
                </span>
              </div>
            </div>

            {!user ? (
              <div className="space-y-2">
                <Button className="w-full" onClick={handleJoin}>Sign In / Sign Up to Join</Button>
                <p className="text-xs text-center text-muted-foreground">
                  You need a Vestara account to join this group
                </p>
              </div>
            ) : (
              <Button className="w-full" onClick={handleJoin} disabled={joining}>
                {joining ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Joining...</> : "Join Group"}
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// Auto-join after sign-in: read the saved token and redirect into the invite flow
function PendingInviteHandler({ children }: { children: React.ReactNode }) {
  const { user } = useSandboxAuth();
  const navigate = useNavigate();
  useEffect(() => {
    const pending = sessionStorage.getItem("pending_sandbox_invite_token");
    if (user && pending) {
      sessionStorage.removeItem("pending_sandbox_invite_token");
      navigate(`/vfd-sandbox/invite/${pending}`, { replace: true });
    }
  }, [user, navigate]);
  return <>{children}</>;
}

export default function SandboxInvite() {
  return (
    <SandboxAuthProvider>
      <SandboxSessionWrapper>
        <PendingInviteHandler>
          <SandboxInviteInner />
        </PendingInviteHandler>
      </SandboxSessionWrapper>
    </SandboxAuthProvider>
  );
}

function SandboxSessionWrapper({ children }: { children: React.ReactNode }) {
  const { session } = useSandboxAuth();
  return (
    <SandboxModeContext.Provider value={{ session }}>
      {children}
    </SandboxModeContext.Provider>
  );
}
