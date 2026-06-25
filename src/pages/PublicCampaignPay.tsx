import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { SocialShareButtons } from "@/components/vfd-sandbox/SocialShareButtons";
import {
  Heart, Target, Users, Clock, Copy, Check, Building2, CreditCard,
  ShieldCheck, AlertTriangle, ArrowRight,
} from "lucide-react";

interface PublicCampaign {
  id: string;
  title: string;
  description: string | null;
  goal_amount: number;
  raised_amount: number;
  contributor_count: number;
  deadline: string | null;
  status: string;
  campaign_slug: string;
  campaign_image: string | null;
  payment_reference: string;
}

const POOL_NUBAN = "1001695610"; // Vestara corporate pool at VFD MFB
const POOL_BANK = "VFD Microfinance Bank";
const POOL_NAME = "Vestara Technologies Ltd";

export default function PublicCampaignPay() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [campaign, setCampaign] = useState<PublicCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: PublicCampaign[] | null; error: { message: string } | null }>;
      }).rpc("get_public_vfd_sandbox_campaign_by_slug", { p_slug: slug });
      if (error) {
        toast({ title: "Campaign unavailable", description: error.message, variant: "destructive" });
      } else {
        setCampaign((data && data[0]) || null);
      }
      setLoading(false);
    })();
  }, [slug, toast]);

  const copy = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    toast({ title: "Copied" });
    setTimeout(() => setCopied(null), 1500);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="max-w-lg mx-auto space-y-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center gap-3">
        <Target className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-lg font-bold">Campaign not found</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          The link may have expired or the campaign owner closed it.
        </p>
        <Link to="/" className="text-sm text-primary underline mt-2">Go to Vestara</Link>
      </div>
    );
  }

  const progress = campaign.goal_amount > 0
    ? Math.min(100, (campaign.raised_amount / campaign.goal_amount) * 100)
    : 0;
  const shareUrl = `${window.location.origin}/goal/${campaign.campaign_slug}`;
  const daysLeft = campaign.deadline
    ? Math.max(0, Math.ceil((new Date(campaign.deadline).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-20 safe-bottom">
      {/* Top bar */}
      <header className="bg-card border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-sm font-bold tracking-tight">Vestara</Link>
          <Badge variant="outline" className="text-[10px] gap-1">
            <ShieldCheck className="h-3 w-3 text-success" /> Secure
          </Badge>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {/* Hero */}
        <section className="rounded-2xl overflow-hidden border border-border/60 bg-card">
          {campaign.campaign_image && (
            <img
              src={campaign.campaign_image}
              alt={campaign.title}
              className="w-full h-48 object-cover"
            />
          )}
          <div className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-lg font-bold leading-tight">{campaign.title}</h1>
              <Badge
                variant="outline"
                className={`text-[10px] capitalize ${
                  campaign.status === "completed"
                    ? "border-success/40 text-success bg-success/5"
                    : "border-primary/30 text-primary bg-primary/5"
                }`}
              >
                {campaign.status}
              </Badge>
            </div>
            {campaign.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {campaign.description}
              </p>
            )}
          </div>
        </section>

        {/* Progress */}
        <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-2xl font-bold">₦{Number(campaign.raised_amount).toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">
                of ₦{Number(campaign.goal_amount).toLocaleString()}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-[11px] text-muted-foreground mt-1.5">{progress.toFixed(1)}% funded</p>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-1 border-t border-border/40">
            <Stat icon={Users} label="Backers" value={campaign.contributor_count.toString()} />
            <Stat
              icon={Clock}
              label={daysLeft !== null ? "Days left" : "Ends"}
              value={daysLeft !== null ? daysLeft.toString() : "Open"}
            />
            <Stat icon={Heart} label="Goal" value={`₦${(campaign.goal_amount / 1000).toFixed(0)}k`} />
          </div>
        </section>

        {/* Payment — Bank transfer */}
        <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-success/5 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-bold">Pay by Bank Transfer</h2>
            <Badge variant="outline" className="text-[10px] ml-auto border-success/40 text-success">Instant</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Send any amount to the account below. <span className="font-semibold text-foreground">You must include the reference in your transfer narration</span> so we can credit this campaign instantly.
          </p>

          <PayField label="Bank" value={POOL_BANK} />
          <PayField
            label="Account Number"
            value={POOL_NUBAN}
            onCopy={() => copy(POOL_NUBAN, "nuban")}
            copied={copied === "nuban"}
            mono
          />
          <PayField label="Account Name" value={POOL_NAME} />
          <PayField
            label="Payment Reference (REQUIRED)"
            value={campaign.payment_reference}
            onCopy={() => copy(campaign.payment_reference, "ref")}
            copied={copied === "ref"}
            mono
            highlight
          />

          <div className="rounded-xl bg-warning/5 border border-warning/30 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Transfers without the reference may be delayed. Funds typically reflect within 1–3 minutes of bank confirmation.
            </p>
          </div>
        </section>

        {/* Payment — Card (coming soon) */}
        <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-3 opacity-90">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-sm font-bold">Pay with Card</h2>
            <Badge variant="outline" className="text-[10px] ml-auto">Coming Soon</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Card checkout is launching shortly. For now, bank transfer above credits the campaign instantly.
          </p>
          <Button variant="outline" disabled className="w-full">
            Pay with Card <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </section>

        {/* Share */}
        <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
          <h2 className="text-sm font-bold">Share this campaign</h2>
          <SocialShareButtons
            url={shareUrl}
            title={campaign.title}
            message={`Help "${campaign.title}" reach its ₦${Number(campaign.goal_amount).toLocaleString()} goal:`}
          />
        </section>

        <p className="text-[10px] text-center text-muted-foreground pt-2">
          Powered by Vestara • Funds settle into the campaign owner's escrow on Vestara
        </p>
      </main>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
        <Icon className="h-3 w-3" />
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

function PayField({
  label, value, onCopy, copied, mono, highlight,
}: {
  label: string; value: string; onCopy?: () => void; copied?: boolean; mono?: boolean; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "border-primary/40 bg-primary/5" : "border-border/50 bg-background"}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-bold ${mono ? "font-mono tracking-wide" : ""} ${highlight ? "text-primary" : ""}`}>
          {value}
        </span>
        {onCopy && (
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>
    </div>
  );
}
