/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { EmailShell, EmailHeading, EmailText, EmailButton } from './email-shell.tsx'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  recipientName?: string
  confirmationUrl: string
}

export const SignupEmail = ({ siteName, recipient, recipientName, confirmationUrl }: SignupEmailProps) => (
  <EmailShell
    preview={`Confirm your email for ${siteName}`}
    greetingName={recipientName || 'there'}
    signOff={`Welcome aboard — we're glad to have you on ${siteName}.`}
    showAppBadges
  >
    <EmailHeading>Confirm your email</EmailHeading>
    <EmailText>Thanks for signing up for {siteName}.</EmailText>
    <EmailText>
      Please confirm that <strong>{recipient}</strong> is your email address by clicking the button
      below.
    </EmailText>
    <EmailButton href={confirmationUrl}>Verify Email</EmailButton>
    <EmailText>If you didn't create an account, you can safely ignore this email.</EmailText>
  </EmailShell>
)

export default SignupEmail
