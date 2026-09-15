/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { EmailShell, EmailHeading, EmailText, EmailButton } from './email-shell.tsx'

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string
  email: string
  newEmail: string
  recipientName?: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  recipientName,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <EmailShell
    preview={`Confirm your email change for ${siteName}`}
    greetingName={recipientName || 'there'}
    signOff="Stay safe out there."
  >
    <EmailHeading>Confirm your email change</EmailHeading>
    <EmailText>
      You requested to change the email address on your {siteName} account from {oldEmail} to{' '}
      {newEmail}.
    </EmailText>
    <EmailText>Click the button below to confirm this change.</EmailText>
    <EmailButton href={confirmationUrl}>Confirm Email Change</EmailButton>
    <EmailText>
      If you didn't request this change, ignore this email and your address stays unchanged.
    </EmailText>
  </EmailShell>
)

export default EmailChangeEmail
