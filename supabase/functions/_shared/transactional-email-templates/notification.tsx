/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import {
  EmailShell,
  EmailHeading,
  EmailText,
  EmailButton,
  DetailList,
} from '../email-templates/email-shell.tsx'

interface Props {
  recipientName?: string
  title?: string
  message?: string
  actionUrl?: string
  actionLabel?: string
  details?: { label?: string; value?: string }[]
  unsubscribeUrl?: string
}

const Notification = ({
  recipientName = 'there',
  title = 'You have a new update',
  message = 'You have a new notification from Vestara.',
  actionUrl,
  actionLabel = 'Open Vestara',
  details,
  unsubscribeUrl,
}: Props) => (
  <EmailShell preview={title} unsubscribeUrl={unsubscribeUrl}>
    <EmailHeading>{title}</EmailHeading>
    <EmailText>Hi {recipientName},</EmailText>
    <EmailText>{message}</EmailText>
    {Array.isArray(details) && details.length > 0 ? (
      <DetailList items={details} />
    ) : null}
    {actionUrl ? <EmailButton href={actionUrl}>{actionLabel}</EmailButton> : null}
  </EmailShell>
)

export const template = {
  component: Notification,
  displayName: 'Notification',
  subject: (data: Props) => data?.title || 'New notification from Vestara',
  previewData: {
    recipientName: 'Ada',
    title: 'Transaction successful',
    message: 'Your airtime purchase was completed successfully.',
    details: [
      { label: 'Amount', value: 'NGN 1,000.00' },
      { label: 'Reference', value: 'vestara-bill-98213' },
      { label: 'Date', value: '22 Aug 2026, 1:18 PM' },
      { label: 'Wallet balance', value: 'NGN 24,500.00' },
    ],
    actionUrl: 'https://vestara.ng/wallet',
    actionLabel: 'View in Vestara',
  },
} satisfies TemplateEntry
