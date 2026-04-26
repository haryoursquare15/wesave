import { useState } from "react";
import {
  useVestaraRateConfigs,
  type VestaraProductCode,
  type VestaraRateConfig,
  type RateConfigInput,
} from "@/hooks/useVestaraRateConfigs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const PRODUCT_LABELS: Record<VestaraProductCode, string> = {
  goalsave: "GoalSave",
  vault: "Vault",
  lockmax: "LockMax",
  upfront_yield: "Upfront Yield",
};

const PRODUCTS: VestaraProductCode[] = ["goalsave", "vault", "lockmax", "upfront_yield"];

const formatNaira = (n: number | null) =>
  n === null ? "∞" : `₦${Number(n).toLocaleString()}`;

interface RateFormProps {
  initial?: Partial<RateConfigInput>;
  onSubmit: (input: RateConfigInput) => Promise<boolean | void>;
  onCancel: () => void;
}

function RateForm({ initial, onSubmit, onCancel }: RateFormProps) {
  const [form, setForm] = useState<RateConfigInput>({
    product_code: (initial?.product_code as VestaraProductCode) ?? "goalsave",
    min_tenor_days: initial?.min_tenor_days ?? 90,
    max_tenor_days: initial?.max_tenor_days ?? 365,
    min_amount: initial?.min_amount ?? 0,
    max_amount: initial?.max_amount ?? null,
    user_rate: initial?.user_rate ?? 12,
    vfd_rate: initial?.vfd_rate ?? 18,
    is_active: initial?.is_active ?? true,
    priority: initial?.priority ?? 10,
    notes: initial?.notes ?? "",
  });
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof RateConfigInput>(k: K, v: RateConfigInput[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  const handle = async () => {
    setSubmitting(true);
    const ok = await onSubmit(form);
    setSubmitting(false);
    if (ok !== false) onCancel();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Product</Label>
          <Select
            value={form.product_code}
            onValueChange={v => update("product_code", v as VestaraProductCode)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRODUCTS.map(p => (
                <SelectItem key={p} value={p}>{PRODUCT_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Priority (higher wins)</Label>
          <Input
            type="number"
            value={form.priority ?? 0}
            onChange={e => update("priority", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>Min Tenor (days)</Label>
          <Input
            type="number"
            value={form.min_tenor_days}
            onChange={e => update("min_tenor_days", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>Max Tenor (days)</Label>
          <Input
            type="number"
            value={form.max_tenor_days}
            onChange={e => update("max_tenor_days", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>Min Amount (₦)</Label>
          <Input
            type="number"
            value={form.min_amount}
            onChange={e => update("min_amount", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>Max Amount (blank = ∞)</Label>
          <Input
            type="number"
            value={form.max_amount ?? ""}
            onChange={e =>
              update("max_amount", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </div>
        <div>
          <Label>User Rate (%)</Label>
          <Input
            type="number"
            step="0.001"
            value={form.user_rate}
            onChange={e => update("user_rate", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>VFD Rate (%)</Label>
          <Input
            type="number"
            step="0.001"
            value={form.vfd_rate}
            onChange={e => update("vfd_rate", Number(e.target.value))}
          />
        </div>
      </div>
      <div>
        <Label>Notes (optional)</Label>
        <Input
          value={form.notes ?? ""}
          onChange={e => update("notes", e.target.value)}
          placeholder="e.g. Long tenor / large balance"
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={form.is_active ?? true}
          onCheckedChange={v => update("is_active", v)}
        />
        <span className="text-sm">{form.is_active ?? true ? "Active" : "Inactive"}</span>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={handle} disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function VestaraRateConfigTab() {
  const { configs, loading, createConfig, updateConfig, toggleActive, deleteConfig } =
    useVestaraRateConfigs();
  const [filter, setFilter] = useState<VestaraProductCode | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<VestaraRateConfig | null>(null);

  const filtered = filter === "all" ? configs : configs.filter(c => c.product_code === filter);

  const spread = (c: VestaraRateConfig) =>
    Number((c.vfd_rate - c.user_rate).toFixed(3));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div>
          <CardTitle>Vestara Rate Configuration</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Configure user/VFD rates by product, tenor, and amount tier. Rates snapshot into each savings at creation — existing savings are not affected.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filter} onValueChange={v => setFilter(v as VestaraProductCode | "all")}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                {PRODUCTS.map(p => (
                  <SelectItem key={p} value={p}>{PRODUCT_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> New tier
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Rate Tier</DialogTitle>
              </DialogHeader>
              <RateForm
                onSubmit={async (input) => {
                  await createConfig(input);
                  return true;
                }}
                onCancel={() => setCreateOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading && configs.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No rate tiers configured.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Tenor (days)</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>VFD</TableHead>
                  <TableHead>Spread</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{PRODUCT_LABELS[c.product_code]}</TableCell>
                    <TableCell>{c.min_tenor_days}–{c.max_tenor_days}</TableCell>
                    <TableCell>{formatNaira(c.min_amount)} – {formatNaira(c.max_amount)}</TableCell>
                    <TableCell>{c.user_rate}%</TableCell>
                    <TableCell>{c.vfd_rate}%</TableCell>
                    <TableCell>
                      <Badge variant={spread(c) >= 0 ? "secondary" : "destructive"}>
                        {spread(c)}%
                      </Badge>
                    </TableCell>
                    <TableCell>{c.priority}</TableCell>
                    <TableCell>
                      <Switch
                        checked={c.is_active}
                        onCheckedChange={v => toggleActive(c.id, v)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditing(c)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this rate tier?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Existing savings keep their snapshotted rates. New savings will fall back to product defaults if no other matching tier exists.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteConfig(c.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Rate Tier</DialogTitle>
            </DialogHeader>
            {editing && (
              <RateForm
                initial={editing}
                onSubmit={async (input) => {
                  await updateConfig(editing.id, input);
                  return true;
                }}
                onCancel={() => setEditing(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
