import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type KycDocumentType =
  | "government_id"
  | "utility_bill"
  | "passport_photograph";

interface DocumentSpec {
  type: KycDocumentType;
  label: string;
  helper: string;
  accept: string;
  required: boolean;
}

interface SandboxKYCDocumentUploadProps {
  tierLevel: number;
  onAllRequiredUploaded?: (allUploaded: boolean) => void;
}

const BUCKET = "vfd-sandbox-kyc-docs";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function getDocsForTier(tier: number): DocumentSpec[] {
  if (tier <= 1) return [];
  const docs: DocumentSpec[] = [
    {
      type: "government_id",
      label: "Government-issued ID",
      helper: "Passport, Driver's License, Voter's Card, or NIN Slip",
      accept: "image/*,application/pdf",
      required: true,
    },
  ];
  if (tier >= 3) {
    docs.push(
      {
        type: "utility_bill",
        label: "Utility Bill",
        helper: "PHCN, Water, or other recent bill (within 3 months)",
        accept: "image/*,application/pdf",
        required: true,
      },
      {
        type: "passport_photograph",
        label: "Passport Photograph",
        helper: "Recent passport-style photo (white background)",
        accept: "image/*",
        required: true,
      },
    );
  }
  return docs;
}

interface UploadedDoc {
  document_type: string;
  file_path: string;
  file_name: string | null;
  uploaded_at: string;
}

export function SandboxKYCDocumentUpload({
  tierLevel,
  onAllRequiredUploaded,
}: SandboxKYCDocumentUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState<KycDocumentType | null>(null);
  const [uploaded, setUploaded] = useState<Record<string, UploadedDoc>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const docs = getDocsForTier(tierLevel);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("vfd_sandbox_kyc_documents")
        .select("document_type,file_path,file_name,uploaded_at")
        .eq("user_id", user.id)
        .eq("tier_level", tierLevel);
      if (data) {
        const map: Record<string, UploadedDoc> = {};
        data.forEach((d) => (map[d.document_type] = d as UploadedDoc));
        setUploaded(map);
      }
    })();
  }, [user?.id, tierLevel]);

  useEffect(() => {
    const requiredTypes = docs.filter((d) => d.required).map((d) => d.type);
    const allUp = requiredTypes.every((t) => uploaded[t]);
    onAllRequiredUploaded?.(allUp);
  }, [uploaded, docs, onAllRequiredUploaded]);

  const handleUpload = async (spec: DocumentSpec, file: File) => {
    if (!user?.id) {
      toast({ title: "Not signed in", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({
        title: "File too large",
        description: "Maximum file size is 5 MB",
        variant: "destructive",
      });
      return;
    }

    setUploading(spec.type);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/tier${tierLevel}/${spec.type}-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      // Remove previous record for the same doc_type if path differs
      const prev = uploaded[spec.type];
      if (prev && prev.file_path !== path) {
        await supabase.storage.from(BUCKET).remove([prev.file_path]);
      }

      const { error: dbErr } = await supabase
        .from("vfd_sandbox_kyc_documents")
        .upsert(
          {
            user_id: user.id,
            tier_level: tierLevel,
            document_type: spec.type,
            file_path: path,
            file_name: file.name,
            mime_type: file.type,
            file_size: file.size,
            verification_status: "pending",
          },
          { onConflict: "user_id,document_type" },
        );
      if (dbErr) throw dbErr;

      setUploaded((prevMap) => ({
        ...prevMap,
        [spec.type]: {
          document_type: spec.type,
          file_path: path,
          file_name: file.name,
          uploaded_at: new Date().toISOString(),
        },
      }));

      toast({ title: "Uploaded", description: `${spec.label} saved successfully` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast({ title: "Upload failed", description: message, variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const handleRemove = async (spec: DocumentSpec) => {
    if (!user?.id) return;
    const rec = uploaded[spec.type];
    if (!rec) return;
    setUploading(spec.type);
    try {
      await supabase.storage.from(BUCKET).remove([rec.file_path]);
      await supabase
        .from("vfd_sandbox_kyc_documents")
        .delete()
        .eq("user_id", user.id)
        .eq("document_type", spec.type);
      setUploaded((prev) => {
        const next = { ...prev };
        delete next[spec.type];
        return next;
      });
      toast({ title: "Removed", description: `${spec.label} removed` });
    } finally {
      setUploading(null);
    }
  };

  if (docs.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Required Documents</h3>
        <p className="text-[10px] text-muted-foreground">
          As required by VFD for Tier {tierLevel}. Files are stored privately and only visible to you and compliance.
        </p>
      </div>

      {docs.map((spec) => {
        const rec = uploaded[spec.type];
        const isUploading = uploading === spec.type;
        return (
          <div
            key={spec.type}
            className="rounded-xl border border-border/50 bg-card p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <Label className="text-xs font-medium">
                  {spec.label}
                  {spec.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">{spec.helper}</p>
              </div>
              {rec && (
                <span className="inline-flex items-center gap-1 text-[10px] text-success bg-success/10 rounded-full px-2 py-0.5 shrink-0">
                  <CheckCircle2 className="h-3 w-3" /> Uploaded
                </span>
              )}
            </div>

            {rec ? (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted/40 p-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-[11px] truncate flex-1" title={rec.file_name || ""}>
                  {rec.file_name || rec.file_path.split("/").pop()}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  disabled={isUploading}
                  onClick={() => fileRefs.current[spec.type]?.click()}
                >
                  Replace
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  disabled={isUploading}
                  onClick={() => handleRemove(spec)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                disabled={isUploading}
                onClick={() => fileRefs.current[spec.type]?.click()}
              >
                {isUploading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                )}
                {isUploading ? "Uploading..." : "Upload file"}
              </Button>
            )}

            <input
              ref={(el) => (fileRefs.current[spec.type] = el)}
              type="file"
              accept={spec.accept}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(spec, file);
                e.target.value = "";
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
