/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { EmailShell, EmailHeading, EmailText, EmailButton } from './email-shell.tsx'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  recipientName?: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, recipientName, confirmationUrl }: InviteEmailProps) => (
  <EmailShell
    preview={`You've been invited to ${siteName}`}
    greetingName={recipientName || 'there'}
    signOff={`We look forward to seeing you on ${siteName}.`}
    showAppBadges
  >
    <EmailHeading>You've been invited</EmailHeading>
    <EmailText>You have been invited to join {siteName}.</EmailText>
    <EmailText>Accept your invitation to set up your account and get started.</EmailText>
    <EmailButton href={confirmationUrl}>Accept Invitation</EmailButton>
    <EmailText>If you weren't expecting this invitation, you can ignore this email.</EmailText>
  </EmailShell>
)

export default InviteEmail
