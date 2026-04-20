import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Share2, Mail } from "lucide-react";
import { useState } from "react";

interface Props {
  url: string;
  title: string;
  message?: string;
}

export function SocialShareButtons({ url, title, message }: Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const text = message || `${title} — Support this campaign:`;
  const fullText = `${text} ${url}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: "Link copied!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        /* user cancelled */
      }
    } else {
      handleCopy();
    }
  };

  const links = [
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(fullText)}`,
      bg: "bg-[#25D366] hover:bg-[#25D366]/90 text-white",
    },
    {
      label: "X",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      bg: "bg-foreground hover:bg-foreground/90 text-background",
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      bg: "bg-[#1877F2] hover:bg-[#1877F2]/90 text-white",
    },
    {
      label: "Telegram",
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      bg: "bg-[#0088cc] hover:bg-[#0088cc]/90 text-white",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border">
        <input readOnly value={url} className="flex-1 text-xs bg-transparent outline-none truncate" />
        <Button size="sm" variant="ghost" onClick={handleCopy} className="h-7 px-2">
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {links.map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
            className={`text-xs font-medium text-center py-2 rounded-lg ${l.bg} transition`}>
            {l.label}
          </a>
        ))}
        <a
          href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(fullText)}`}
          className="text-xs font-medium text-center py-2 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center gap-1"
        >
          <Mail className="h-3.5 w-3.5" /> Email
        </a>
        <button
          onClick={handleNative}
          className="text-xs font-medium text-center py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-1"
        >
          <Share2 className="h-3.5 w-3.5" /> More
        </button>
      </div>
    </div>
  );
}
