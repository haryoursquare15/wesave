import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, Calendar, DollarSign, Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useValidateInvite, useJoinGroupViaInvite } from "@/hooks/useGroupInvites";
import { useUserGroupCount } from "@/hooks/useUserGroupCount";
import { toast } from "sonner";

import { getUserFriendlyError } from "@/lib/errorMessages";
export default function Invite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { validateToken, validation, loading: validating, error: validationError } = useValidateInvite();
  const { joinGroup, loading: joining } = useJoinGroupViaInvite();
  const { canJoinGroup, groupCount } = useUserGroupCount();
  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "joining" | "joined">("loading");

  useEffect(() => {
    if (token) {
      validateToken(token)
        .then((result) => {
          if (result?.valid) {
            setStatus("valid");
          } else {
            setStatus("invalid");
          }
        })
        .catch(() => {
          setStatus("invalid");
        });
    }
  }, [token, validateToken]);

  const handleJoinGroup = async () => {
    if (!user) {
      // Store invite token and redirect to auth
      sessionStorage.setItem("pending_invite_token", token || "");
      navigate("/auth?mode=signup");
      return;
    }

    try {
      setStatus("joining");
      const result = await joinGroup(token!);
      setStatus("joined");
      toast.success("You've joined the group!");
      // Redirect to group detail so tokenization gate can appear if needed
      const groupId = result.group_id;
      setTimeout(() => {
        navigate(groupId ? `/groups/${groupId}` : "/dashboard");
      }, 1500);
    } catch (err: any) {
      toast.error(getUserFriendlyError(err.message || "Failed to join group"));
      setStatus("valid");
    }
  };

  const handleSignUp = () => {
    sessionStorage.setItem("pending_invite_token", token || "");
    navigate("/auth?mode=signup");
  };

  if (authLoading || validating || status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Validating invitation...</p>
        </motion.div>
      </div>
    );
  }

  if (status === "invalid" || !validation?.valid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="w-full max-w-md">
            <CardContent className="pt-6 text-center">
              <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">
                Invalid Invitation
              </h2>
              <p className="text-muted-foreground mb-6">
                {validation?.error_message || "This invitation link is invalid or has expired."}
              </p>
              <Button onClick={() => navigate("/")} className="w-full">
                Go to Home
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (status === "joined") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="w-full max-w-md">
            <CardContent className="pt-6 text-center">
              <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">
                Welcome to the Group!
              </h2>
              <p className="text-muted-foreground">
                Redirecting to your dashboard...
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amount);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card>
          <CardHeader className="text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">You're Invited!</CardTitle>
            <p className="text-muted-foreground">
              Join <span className="font-semibold text-foreground">{validation.group_name}</span>
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-xl p-4 text-center">
                <DollarSign className="h-5 w-5 text-primary mx-auto mb-2" />
                <p className="text-xs text-muted-foreground mb-1">Contribution</p>
                <p className="font-semibold text-foreground">
                  {formatAmount(validation.contribution_amount || 0)}
                </p>
              </div>
              <div className="bg-muted/50 rounded-xl p-4 text-center">
                <Calendar className="h-5 w-5 text-primary mx-auto mb-2" />
                <p className="text-xs text-muted-foreground mb-1">Frequency</p>
                <p className="font-semibold text-foreground capitalize">
                  {validation.period}
                </p>
              </div>
            </div>

            <div className="bg-muted/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Members</span>
                <span className="font-semibold text-foreground">
                  {validation.member_count}/{validation.max_members}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{
                    width: `${((validation.member_count || 0) / (validation.max_members || 1)) * 100}%`,
                  }}
                />
              </div>
            </div>

            {user ? (
              <>
                {!canJoinGroup && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground">
                      You are already in {groupCount} active groups. You can only be a member of up to 2 active groups at a time.
                    </p>
                  </div>
                )}
                <Button
                  variant="hero"
                  className="w-full h-12"
                  onClick={handleJoinGroup}
                  disabled={joining || status === "joining" || !canJoinGroup}
                >
                  {joining || status === "joining" ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    "Join Group"
                  )}
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <Button
                  variant="hero"
                  className="w-full h-12"
                  onClick={handleSignUp}
                >
                  Sign Up to Join
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <button
                    onClick={() => {
                      sessionStorage.setItem("pending_invite_token", token || "");
                      navigate("/auth");
                    }}
                    className="text-primary hover:underline"
                  >
                    Sign In
                  </button>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
