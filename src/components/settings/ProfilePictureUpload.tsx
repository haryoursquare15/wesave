import { useState, useRef, useEffect } from "react";
import { Camera, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { toast } from "sonner";

interface ProfilePictureUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function ProfilePictureUpload({ open, onOpenChange, onComplete }: ProfilePictureUploadProps) {
  const { session, client: supabase } = useSandboxAwareAuth();
  const user = session?.user;
  const [profile, setProfile] = useState<{ avatar_url: string | null; full_name: string | null } | null>(null);
  const refreshProfile = async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("avatar_url, full_name").eq("id", user.id).maybeSingle();
    setProfile(data);
    window.dispatchEvent(new Event("vestara:profile-updated"));
  };
  useEffect(() => {
    if (!open || !user) return;
    void supabase.from("profiles").select("avatar_url, full_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => setProfile(data));
  }, [open, user?.id, supabase]);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
      toast.error("Choose a JPG, PNG, GIF or WebP photo");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!user || !selectedFile) return;

    setUploading(true);

    try {
      // Upload to Supabase Storage with user folder for RLS
      const fileExt = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" }[selectedFile.type] || "jpg";
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, selectedFile, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      if (updateError) {
        await supabase.storage.from("avatars").remove([filePath]);
        throw updateError;
      }

      await refreshProfile();
      toast.success("Profile picture updated!");
      handleClose();
      onComplete?.();
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Your photo wasn't saved. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    onOpenChange(false);
  };

  const handleRemovePhoto = async () => {
    if (!user) return;

    setUploading(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);

      if (error) throw error;

      await refreshProfile();
      toast.success("Profile picture removed");
      handleClose();
    } catch (err) {
      console.error("Remove error:", err);
      toast.error("Failed to remove profile picture");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !uploading) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Profile Picture
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Preview */}
          <div className="flex flex-col items-center gap-4">
            <Avatar className="h-32 w-32">
              <AvatarImage src={previewUrl || profile?.avatar_url || undefined} alt="Your profile photo" className="object-cover" />
              <AvatarFallback className="text-3xl">
                {getInitials(profile?.full_name)}
              </AvatarFallback>
            </Avatar>

            <input
              type="file"
              aria-label="Choose profile photo"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileSelect}
              ref={fileInputRef}
              className="hidden"
            />

            {!selectedFile ? (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Choose Photo
                </Button>
                {profile?.avatar_url && (
                  <Button
                    variant="outline"
                    onClick={handleRemovePhoto}
                    disabled={uploading}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewUrl(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={uploading}
                >
                  {uploading ? (
                    <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Upload
                </Button>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            JPG, PNG, GIF or WebP · Up to 5MB
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
