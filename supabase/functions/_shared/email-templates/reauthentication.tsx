/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { EmailShell, EmailHeading, EmailText, EmailHighlight } from './email-shell.tsx'

interface ReauthenticationEmailProps {
  token: string
  recipientName?: string
}

export const ReauthenticationEmail = ({ token, recipientName }: ReauthenticationEmailProps) => (
  <EmailShell
    preview="Your verification code"
    greetingName={recipientName || 'there'}
    signOff="Stay safe out there."
  >
    <EmailHeading>Confirm reauthentication</EmailHeading>
    <EmailText>Use the code below to confirm your identity:</EmailText>
    <EmailHighlight label="Verification code" value={token} />
    <EmailText>
      This code will expire shortly. If you didn't request this, you can safely ignore this email.
    </EmailText>
  </EmailShell>
)

export default ReauthenticationEmail
