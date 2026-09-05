import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  Heading2, Heading3, Link2, Image as ImageIcon, Quote,
  AlignLeft, AlignCenter, AlignRight, Undo2, Redo2, Eraser, Loader2,
} from "lucide-react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

/**
 * Lightweight rich-text composer for admin bulk emails.
 * Produces simple, email-safe HTML (formatting tags + hosted <img>).
 */
export function RichEmailEditor({ value, onChange, placeholder }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showLink, setShowLink] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const el = editorRef.current;
    if (el && el.innerHTML !== value) el.innerHTML = value;
    // Only sync when the value changes externally (e.g. reset after send).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value === "" ? "" : undefined]);

  const emit = useCallback(() => {
    onChange(editorRef.current?.innerHTML ?? "");
  }, [onChange]);

  const exec = (command: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const insertHtml = (html: string) => {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    emit();
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Not an image", description: "Choose a JPG, PNG or GIF file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Please use an image under 5MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `bulk/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("email-assets").upload(path, file, {
        cacheControl: "31536000",
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("email-assets").getPublicUrl(path);
      insertHtml(
        `<img src="${data.publicUrl}" alt="" width="560" style="max-width: 100%; height: auto; border-radius: 8px; display: block;" /><p><br/></p>`
      );
    } catch (err: unknown) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not add that image.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const ToolButton = ({ icon: Icon, label, onClick }: { icon: typeof Bold; label: string; onClick: () => void }) => (
    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title={label} aria-label={label}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Icon className="h-4 w-4" />
    </Button>
  );

  return (
    <div className="rounded-lg border bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b p-1.5">
        <ToolButton icon={Bold} label="Bold" onClick={() => exec("bold")} />
        <ToolButton icon={Italic} label="Italic" onClick={() => exec("italic")} />
        <ToolButton icon={Underline} label="Underline" onClick={() => exec("underline")} />
        <ToolButton icon={Strikethrough} label="Strikethrough" onClick={() => exec("strikeThrough")} />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <ToolButton icon={Heading2} label="Large heading" onClick={() => exec("formatBlock", "<h2>")} />
        <ToolButton icon={Heading3} label="Small heading" onClick={() => exec("formatBlock", "<h3>")} />
        <ToolButton icon={Quote} label="Quote" onClick={() => exec("formatBlock", "<blockquote>")} />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <ToolButton icon={List} label="Bullet list" onClick={() => exec("insertUnorderedList")} />
        <ToolButton icon={ListOrdered} label="Numbered list" onClick={() => exec("insertOrderedList")} />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <ToolButton icon={AlignLeft} label="Align left" onClick={() => exec("justifyLeft")} />
        <ToolButton icon={AlignCenter} label="Align centre" onClick={() => exec("justifyCenter")} />
        <ToolButton icon={AlignRight} label="Align right" onClick={() => exec("justifyRight")} />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <ToolButton icon={Link2} label="Add link" onClick={() => setShowLink((s) => !s)} />
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Insert image"
          aria-label="Insert image" disabled={uploading}
          onMouseDown={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <ToolButton icon={Undo2} label="Undo" onClick={() => exec("undo")} />
        <ToolButton icon={Redo2} label="Redo" onClick={() => exec("redo")} />
        <ToolButton icon={Eraser} label="Clear formatting" onClick={() => exec("removeFormat")} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
      </div>

      {showLink && (
        <div className="flex gap-2 border-b p-2">
          <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..."
            className="h-8 text-sm"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (linkUrl.trim()) { exec("createLink", linkUrl.trim()); setLinkUrl(""); setShowLink(false); } } }} />
          <Button type="button" size="sm" className="h-8"
            onClick={() => { if (linkUrl.trim()) { exec("createLink", linkUrl.trim()); setLinkUrl(""); setShowLink(false); } }}>
            Apply
          </Button>
        </div>
      )}

      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Email body"
        data-placeholder={placeholder || "Write your message..."}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
          if (item) {
            const file = item.getAsFile();
            if (file) { e.preventDefault(); handleUpload(file); }
          }
        }}
        className="prose-sm min-h-[220px] max-w-none overflow-y-auto p-4 text-sm leading-relaxed outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_img]:my-2 [&_img]:rounded-md [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:list-disc"
      />
    </div>
  );
}
