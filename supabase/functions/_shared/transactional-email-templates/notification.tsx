/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Text, Hr, Link, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  recipientName?: string
  title?: string
  message?: string
  actionUrl?: string
  actionLabel?: string
  details?: { label?: string; value?: string }[]
  unsubscribeUrl?: string
}

const LOGO_URL = 'https://vestara.ng/__l5e/assets-v1/833d06eb-58c2-42da-9af9-e4a7a732febe/vestara-logo.jpg'
const APP_URL = 'https://vestara.ng'
const SPLIT_BILL_URL = 'https://vestara.ng/splitpay'

const Notification = ({
  recipientName = 'there',
  title = 'You have a new update',
  message = 'You have a new notification from Vestara.',
  actionUrl,
  actionLabel = 'Open Vestara',
  details,
  unsubscribeUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{title}</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header with logo */}
        <Section style={header}>
          <Img src={LOGO_URL} alt="Vestara" width="96" height="96" style={logo} />
          <Text style={brandWordmark}>VESTARA</Text>
          <Text style={brandTagline}>Grow Your Money Smarter</Text>
        </Section>

        {/* Main card */}
        <Section style={card}>
          <Heading style={h1}>{title}</Heading>
          <Text style={text}>Hi {recipientName},</Text>
          <Text style={text}>{message}</Text>
          {Array.isArray(details) && details.length > 0 ? (
            <Section style={detailBox}>
              {details.map((d, i) => (
                <Text key={i} style={detailRow}>
                  <span style={detailLabel}>{d?.label ?? ''}</span>
                  <span style={detailValue}>{d?.value ?? ''}</span>
                </Text>
              ))}
            </Section>
          ) : null}
          {actionUrl ? (
            <Section style={{ textAlign: 'center', margin: '24px 0 4px' }}>
              <Button style={button} href={actionUrl}>{actionLabel}</Button>
            </Section>
          ) : null}
        </Section>

        {/* Combined footer: Split Bill promo + links + legal */}
        <Section style={footer}>
          <Text style={promoEyebrow}>NEW · SPLIT BILL</Text>
          <Heading as="h2" style={promoTitle}>
            Share the bill. Skip the awkward maths.
          </Heading>
          <Text style={promoText}>
            Split dinners, rent, trips and subscriptions with friends — everyone pays their share.
          </Text>
          <Button style={promoButton} href={SPLIT_BILL_URL}>
            Try Split Bill →
          </Button>

          <Hr style={footerHr} />

          <Text style={footerLinks}>
            <Link href={APP_URL} style={footerLink}>Home</Link>
            {'  ·  '}
            <Link href={`${APP_URL}/wallet`} style={footerLink}>Wallet</Link>
            {'  ·  '}
            <Link href={SPLIT_BILL_URL} style={footerLink}>Split Bill</Link>
            {'  ·  '}
            <Link href={`${APP_URL}/support`} style={footerLink}>Support</Link>
          </Text>

          <Text style={footerFine}>
            You're receiving this because you have a Vestara account.
            {unsubscribeUrl ? (
              <>
                {' '}
                <Link href={unsubscribeUrl} style={footerLink}>Unsubscribe</Link>
              </>
            ) : null}
          </Text>
          <Text style={footerFine}>
            © {new Date().getFullYear()} Vestara · Grow Your Money Smarter
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Notification,
  displayName: 'Notification',
  subject: (data: Props) => data?.title || 'New notification from Vestara',
  previewData: {
    recipientName: 'Ada',
    title: 'New contribution received',
    message: 'Your group "Lagos Savers" just received NGN 5,000. Great teamwork!',
    actionUrl: 'https://vestara.ng/dashboard',
    actionLabel: 'View in Vestara',
  },
} satisfies TemplateEntry

/* ---------- styles ---------- */
/* Vestara brand:
   - Primary orange:  #E8621A
   - Gold accent:     #F5B921
   - Ink:             #1a1208
   - Cream surface:   #FFF8F1
*/
const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
  margin: 0,
  padding: '24px 0',
}
const container = { maxWidth: '600px', margin: '0 auto', padding: '0 16px' }

const header = {
  textAlign: 'center' as const,
  padding: '16px 0 24px',
}
const logo = {
  display: 'block',
  margin: '0 auto',
  borderRadius: '20px',
  boxShadow: '0 6px 18px rgba(232, 98, 26, 0.18)',
}
const brandWordmark = {
  fontSize: '14px',
  letterSpacing: '8px',
  color: '#E8621A',
  fontWeight: 'bold' as const,
  margin: '14px 0 4px',
}
const brandTagline = {
  fontSize: '11px',
  letterSpacing: '2px',
  color: '#8a7656',
  textTransform: 'uppercase' as const,
  margin: 0,
}

const card = {
  backgroundColor: '#FFF8F1',
  border: '1px solid #f3e3cf',
  padding: '32px 28px 28px',
  borderRadius: '14px',
  borderTop: '4px solid #E8621A',
}
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a1208', margin: '0 0 18px' }
const text = { fontSize: '15px', color: '#3a2a1a', lineHeight: '1.6', margin: '0 0 14px' }
const detailBox = {
  backgroundColor: '#ffffff',
  border: '1px solid #f3e3cf',
  borderRadius: '10px',
  padding: '6px 16px',
  margin: '4px 0 8px',
}
const detailRow = {
  fontSize: '14px',
  margin: '10px 0',
  color: '#3a2a1a',
}
const detailLabel = { color: '#8a7656', marginRight: '8px' }
const detailValue = { color: '#1a1208', fontWeight: 'bold' as const }

const button = {
  backgroundColor: '#E8621A',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '10px',
  padding: '13px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}

/* Combined footer */
const footer = {
  marginTop: '20px',
  padding: '28px 26px 24px',
  borderRadius: '14px',
  background: 'linear-gradient(135deg, #1a1208 0%, #2a1a0c 100%)',
  textAlign: 'center' as const,
}
const promoEyebrow = {
  fontSize: '11px',
  letterSpacing: '2px',
  color: '#F5B921',
  fontWeight: 'bold' as const,
  margin: '0 0 10px',
}
const promoTitle = { fontSize: '19px', color: '#ffffff', margin: '0 0 8px', lineHeight: '1.3' }
const promoText = { fontSize: '13px', color: '#d8c7a8', lineHeight: '1.6', margin: '0 0 16px' }
const promoButton = {
  backgroundColor: '#F5B921',
  color: '#1a1208',
  fontSize: '13px',
  fontWeight: 'bold' as const,
  borderRadius: '10px',
  padding: '11px 22px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footerHr = { borderColor: '#3a2a18', margin: '22px 0 16px' }
const footerLinks = { fontSize: '13px', color: '#d8c7a8', margin: '0 0 14px' }
const footerLink = { color: '#F5B921', textDecoration: 'none' }
const footerFine = { fontSize: '11px', color: '#8a7656', lineHeight: '1.6', margin: '4px 0' }
