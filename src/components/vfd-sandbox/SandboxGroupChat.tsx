import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";

interface ChatMessage {
  id: string;
  group_id: string;
  user_id: string;
  message: string;
  message_type: string;
  created_at: string;
  display_name?: string;
}

interface Props {
  groupId: string;
  currentUserId?: string;
}

const SYSTEM_TYPES = new Set([
  "system", "auto_contribution", "contribution_status", "contribution_failed",
  "payout_notification", "swap_window_open", "group_started", "group_restarted",
]);

export function SandboxGroupChat({ groupId, currentUserId }: Props) {
  const products = useVfdSandboxProducts();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const r = await products.listGroupChat(groupId);
    if (r?.data) setMessages(r.data);
  };

  useEffect(() => {
    load(); // eslint-disable-line @typescript-eslint/no-floating-promises
    const ch = sandboxSupabase
      .channel(`sandbox-chat-${groupId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "vfd_sandbox_chat_messages", filter: `group_id=eq.${groupId}` },
        () => load())
      .subscribe();
    return () => { sandboxSupabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const msg = text.trim();
    if (!msg) return;
    setSending(true);
    const r = await products.postGroupChat(groupId, msg);
    setSending(false);
    if (r?.data) {
      setText("");
      // optimistic refresh; realtime will dedupe by id on next load
      load();
    }
  };

  return (
    <div className="flex flex-col h-[420px] rounded-xl border bg-card">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-8">No messages yet. Say hello 👋</p>
        )}
        {messages.map((m) => {
          const isSystem = SYSTEM_TYPES.has(m.message_type);
          const isMine = m.user_id === currentUserId && !isSystem;
          if (isSystem) {
            return (
              <div key={m.id} className="text-center">
                <span className="inline-block text-[11px] text-muted-foreground bg-muted/40 px-2 py-1 rounded-full">
                  {m.display_name ? `${m.display_name}: ` : ""}{m.message}
                </span>
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${isMine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {!isMine && <p className="text-[10px] font-semibold opacity-70 mb-0.5">{m.display_name}</p>}
                <p className="whitespace-pre-wrap break-words">{m.message}</p>
                <p className={`text-[9px] mt-0.5 ${isMine ? "opacity-70" : "text-muted-foreground"}`}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="p-2 border-t flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type a message…"
          maxLength={1000}
        />
        <Button size="icon" onClick={send} disabled={sending || !text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
