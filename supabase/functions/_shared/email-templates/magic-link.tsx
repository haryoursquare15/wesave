/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { EmailShell, EmailHeading, EmailText, EmailButton } from './email-shell.tsx'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <EmailShell preview={`Your login link for ${siteName}`}>
    <EmailHeading>Your login link</EmailHeading>
    <EmailText>Click the button below to sign in to {siteName}.</EmailText>
    <EmailButton href={confirmationUrl}>Sign in</EmailButton>
    <EmailText>This link expires shortly and can only be used once.</EmailText>
    <EmailText>If you didn't request this link, you can safely ignore this email.</EmailText>
  </EmailShell>
)

export default MagicLinkEmail
