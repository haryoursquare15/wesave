import { useEffect, useState } from "react";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import {
  TransactionSuccessModal,
  TransactionSuccessPayload,
} from "@/components/feedback/TransactionSuccessModal";

/**
 * Listens for newly-inserted `bill_payment` notifications for the signed-in
 * sandbox user and shows the shared TransactionSuccessModal as a pop-up.
 *
 * This means both the SplitPay creator and every paying contributor see an
 * immediate success confirmation the moment the bill is delivered, regardless
 * of who triggered the final payment.
 */
export function BillDeliveryPopupListener() {
  const { client, session } = useSandboxAwareAuth();
  const userId = session?.user?.id;
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<TransactionSuccessPayload | null>(null);

  useEffect(() => {
    if (!userId) return;

    const channel = client
      .channel(`sandbox-bill-delivery-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vfd_sandbox_notifications",
          filter: `user_id=eq.${userId}`,
        },
        (row: any) => {
          const n = row?.new || {};
          if (n.notification_type !== "bill_payment") return;

          // Try to pull a reference id out of the message (…Ref: <id>)
          const msg: string = String(n.message || "");
          const refMatch = msg.match(/Ref:\s*([\w-]+)/i);

          setPayload({
            title: n.title || "Bill delivered",
            description: msg || "Your SplitPay bill has been delivered successfully.",
            reference: refMatch?.[1],
            primaryLabel: "Done",
            autoCloseMs: 6000,
          });
          setOpen(true);
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [client, userId]);

  return (
    <TransactionSuccessModal
      open={open}
      onOpenChange={setOpen}
      payload={payload}
    />
  );
}
