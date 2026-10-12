// TEMPORARY visual-check route for the Withdraw screen layout. Remove after verification.
import { SandboxWithdraw } from "@/components/vfd-sandbox/SandboxWithdraw";

export default function WithdrawPreview() {
  return (
    <SandboxWithdraw
      userId=""
      accountNumber="1049590180"
      availableBalance={720}
      onWithdraw={async () => null}
      onBack={() => window.history.back()}
      onSetupBank={() => {}}
    />
  );
}
