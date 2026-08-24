/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { EmailShell, EmailHeading, EmailText, BRAND } from './email-shell.tsx'

interface ReauthenticationEmailProps {
  token: string
  recipientName?: string
}

export const ReauthenticationEmail = ({ token, recipientName }: ReauthenticationEmailProps) => (
  <EmailShell
    preview="Your verification code"
    greetingName={recipientName || 'there'}
    signOff="Thanks for keeping your account secure."
  >
    <EmailHeading>Confirm it's you</EmailHeading>
    <EmailText>Use the verification code below to confirm your identity.</EmailText>
    <Text style={codeStyle}>{token}</Text>
    <EmailText>
      This code expires shortly. If you didn't request it, you can safely ignore this email.
    </EmailText>
  </EmailShell>
)

export default ReauthenticationEmail

const codeStyle = {
  fontSize: '30px',
  fontWeight: 'bold' as const,
  letterSpacing: '10px',
  color: BRAND.navy,
  backgroundColor: BRAND.surface,
  border: `1px solid ${BRAND.border}`,
  borderRadius: '10px',
  padding: '18px 0',
  textAlign: 'center' as const,
  margin: '18px 0 20px',
}
