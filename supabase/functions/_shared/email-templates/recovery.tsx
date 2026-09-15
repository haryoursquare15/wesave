/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { EmailShell, EmailHeading, EmailText, EmailButton } from './email-shell.tsx'

interface RecoveryEmailProps {
  siteName: string
  recipientName?: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, recipientName, confirmationUrl }: RecoveryEmailProps) => (
  <EmailShell
    preview={`Reset your ${siteName} password`}
    greetingName={recipientName || 'there'}
    signOff="Stay safe out there."
  >
    <EmailHeading>Reset your password</EmailHeading>
    <EmailText>We received a request to reset the password on your {siteName} account.</EmailText>
    <EmailButton href={confirmationUrl}>Reset Password</EmailButton>
    <EmailText>
      If you didn't request a password reset, you can safely ignore this email — your password stays
      unchanged.
    </EmailText>
  </EmailShell>
)

export default RecoveryEmail
