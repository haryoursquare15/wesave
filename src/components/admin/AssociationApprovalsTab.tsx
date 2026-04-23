import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { CheckCircle2, XCircle, FileText, Building2, ExternalLink } from "lucide-react";

interface PendingAssoc {
  id: string;
  name: string;
  description: string | null;
  admin_id: string;
  admin_name: string;
  member_count: number;
  max_members: number;
  created_at: string;
  signatures_url: string;
  request_letter_url: string;
  executive_ids_url: string;
}

export function AssociationApprovalsTab() {
  const products = useVfdSandboxProducts();
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingAssoc[]>([]);
  const [rejecting, setRejecting] = useState<PendingAssoc | null>(null);
  const [reason, setReason] = useState("");

  const refresh = async () => {
    const r = await products.adminListPendingAssoc();
    if (r?.data) setPending(r.data);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const openDoc = async (path: string) => {
    const r = await products.adminAssocDocUrl(path);
    if (r?.data?.url) window.open(r.data.url, "_blank");
  };

  const approve = async (id: string) => {
    const r = await products.adminReviewAssoc(id, "approve");
    if (r?.data) { toast({ title: "Approved" }); refresh(); }
  };

  const reject = async () => {
    if (!rejecting) return;
    const r = await products.adminReviewAssoc(rejecting.id, "reject", reason || "Documentation insufficient");
    if (r?.data) { toast({ title: "Rejected" }); setRejecting(null); setReason(""); refresh(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5" /> Sandbox Association Approvals
        </h3>
        <Badge variant="secondary">{pending.length} pending</Badge>
      </div>

      {pending.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No pending associations.</CardContent></Card>
      ) : pending.map((a) => (
        <Card key={a.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{a.name}</CardTitle>
              <Badge variant="outline">{format(new Date(a.created_at), "MMM d, HH:mm")}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Admin: {a.admin_name} • {a.member_count}/{a.max_members} members</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <DocButton label="Member Signatures" path={a.signatures_url} onOpen={openDoc} />
              <DocButton label="Request Letter" path={a.request_letter_url} onOpen={openDoc} />
              <DocButton label="Executive IDs" path={a.executive_ids_url} onOpen={openDoc} />
            </div>

            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={() => approve(a.id)} className="flex-1">
                <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setRejecting(a)} className="flex-1">
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject {rejecting?.name}?</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Reason (shown to applicant)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Documents incomplete or not legible..." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={reject}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocButton({ label, path, onOpen }: { label: string; path: string; onOpen: (p: string) => void }) {
  return (
    <Button variant="outline" size="sm" className="justify-between text-xs" onClick={() => onOpen(path)}>
      <span className="flex items-center gap-1 truncate"><FileText className="h-3 w-3" />{label}</span>
      <ExternalLink className="h-3 w-3" />
    </Button>
  );
}
