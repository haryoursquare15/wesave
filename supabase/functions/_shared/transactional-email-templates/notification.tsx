/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import {
  EmailShell,
  EmailHeading,
  EmailText,
  EmailButton,
  EmailHighlight,
  DetailList,
} from '../email-templates/email-shell.tsx'

interface Props {
  recipientName?: string
  title?: string
  message?: string
  actionUrl?: string
  actionLabel?: string
  details?: { label?: string; value?: string }[]
  /** Optional headline figure, e.g. an amount or status. Presentation only. */
  highlightLabel?: string
  highlightValue?: string
  /** Closing line; falls back to the standard Vestara sign-off. */
  signOff?: string
  /** Defaults to true — every account/transaction email carries the notice. */
  securityNotice?: boolean
  showAppBadges?: boolean
  unsubscribeUrl?: string
}

/**
 * Presentation helpers — these only affect how existing text is displayed.
 * No amount, reference or date is computed or altered here.
 */
const MONEY_OR_REF =
  /((?:NGN|\u20A6)\s?[\d,]+(?:\.\d{2})?|vestara-[A-Za-z0-9-]+|[A-Z]{2,}-[A-Z0-9]{4,})/
const MONEY_OR_REF_G = new RegExp(MONEY_OR_REF.source, 'g')

const emphasise = (line: string, keyPrefix: string): React.ReactNode[] =>
  line
    .split(MONEY_OR_REF_G)
    .filter((part) => part !== '' && part !== undefined)
    .map((part, i) =>
      MONEY_OR_REF.test(part) ? (
        <strong key={`${keyPrefix}-${i}`}>{part}</strong>
      ) : (
        <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>
      )
    )

/** Turn a message blob into scannable paragraphs / key-value rows. */
const Bodycopy = ({ message }: { message: string }) => {
  const lines = message
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) return null

  return (
    <>
      {lines.map((line, i) => (
        <EmailText key={i}>{emphasise(line, `l${i}`)}</EmailText>
      ))}
    </>
  )
}

const Notification = ({
  recipientName = 'there',
  title = 'You have a new update',
  message = 'You have a new notification from Vestara.',
  actionUrl,
  actionLabel = 'Open Vestara',
  details,
  highlightLabel,
  highlightValue,
  signOff,
  securityNotice = true,
  showAppBadges = false,
  unsubscribeUrl,
}: Props) => (
  <EmailShell
    preview={title}
    greetingName={recipientName}
    signOff={signOff || 'Thank you for choosing Vestara — we are glad to have you.'}
    securityNotice={securityNotice}
    showAppBadges={showAppBadges}
    unsubscribeUrl={unsubscribeUrl}
  >
    <EmailHeading>{title}</EmailHeading>
    <Bodycopy message={message} />
    {highlightValue ? (
      <EmailHighlight label={highlightLabel} value={highlightValue} />
    ) : null}
    {Array.isArray(details) && details.length > 0 ? <DetailList items={details} /> : null}
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
    message:
      'Your airtime purchase of NGN 1,000.00 was completed successfully.\nThe amount has been debited from your Vestara wallet.',
    highlightLabel: 'Amount paid',
    highlightValue: 'NGN 1,000.00',
    details: [
      { label: 'Amount', value: 'NGN 1,000.00' },
      { label: 'Reference', value: 'vestara-bill-98213' },
      { label: 'Date', value: '22 Aug 2026, 1:18 PM' },
      { label: 'Wallet balance', value: 'NGN 24,500.00' },
    ],
    actionUrl: 'https://vestara.ng/wallet',
    actionLabel: 'View Transaction',
    showAppBadges: true,
  },
} satisfies TemplateEntry
