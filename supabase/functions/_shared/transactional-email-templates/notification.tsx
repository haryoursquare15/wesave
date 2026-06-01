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
  unsubscribeUrl?: string
}

const BANNER_URL = 'https://vestara.ng/__l5e/assets-v1/37f8b07d-1fff-47ca-a0da-4557a8244e1f/vestara-email-banner.jpg'
const APP_URL = 'https://vestara.ng'
const SPLIT_BILL_URL = 'https://vestara.ng/splitpay'

const Notification = ({
  recipientName = 'there',
  title = 'You have a new update',
  message = 'You have a new notification from Vestara.',
  actionUrl,
  actionLabel = 'Open Vestara',
  unsubscribeUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{title}</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Hero banner */}
        <Section style={bannerWrap}>
          <Img
            src={BANNER_URL}
            alt="Vestara — Grow Your Money Smarter"
            width="560"
            style={banner}
          />
        </Section>

        {/* Body card */}
        <Section style={card}>
          <Heading style={h1}>{title}</Heading>
          <Text style={text}>Hi {recipientName},</Text>
          <Text style={text}>{message}</Text>
          {actionUrl ? (
            <Button style={button} href={actionUrl}>{actionLabel}</Button>
          ) : null}
        </Section>

        {/* Split Bill promo strip */}
        <Section style={promo}>
          <Text style={promoEyebrow}>NEW · SPLIT BILL</Text>
          <Heading as="h2" style={promoTitle}>
            Share the bill. Skip the awkward maths.
          </Heading>
          <Text style={promoText}>
            Split dinners, rent, trips and subscriptions instantly with friends.
            Everyone pays their share — Vestara handles the rest.
          </Text>
          <Button style={promoButton} href={SPLIT_BILL_URL}>
            Try Split Bill →
          </Button>
        </Section>

        {/* Footer */}
        <Section style={footer}>
          <Heading as="h3" style={footerBrand}>VESTARA</Heading>
          <Text style={footerTagline}>Grow Your Money Smarter</Text>

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
            © {new Date().getFullYear()} Vestara. All rights reserved.
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
    message: 'Your group "Lagos Savers" just received ₦5,000. Great teamwork!',
    actionUrl: 'https://vestara.ng/dashboard',
    actionLabel: 'View in Vestara',
  },
} satisfies TemplateEntry

/* ---------- styles ---------- */
const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
  margin: 0,
  padding: '24px 0',
}
const container = { maxWidth: '600px', margin: '0 auto', padding: '0 16px' }

const bannerWrap = { margin: 0, padding: 0 }
const banner = {
  width: '100%',
  height: 'auto',
  display: 'block',
  borderRadius: '14px 14px 0 0',
}

const card = {
  backgroundColor: '#ffffff',
  border: '1px solid #ececec',
  borderTop: 'none',
  padding: '28px 28px 24px',
  borderRadius: '0 0 14px 14px',
}
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 18px' }
const text = { fontSize: '15px', color: '#3a3a3a', lineHeight: '1.6', margin: '0 0 14px' }
const button = {
  backgroundColor: '#0d0d0d',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '10px',
  padding: '13px 22px',
  textDecoration: 'none',
  display: 'inline-block',
  marginTop: '10px',
}

/* Split Bill promo */
const promo = {
  marginTop: '20px',
  padding: '26px 26px 24px',
  borderRadius: '14px',
  background: 'linear-gradient(135deg, #111111 0%, #1f1f1f 100%)',
  textAlign: 'center' as const,
}
const promoEyebrow = {
  fontSize: '11px',
  letterSpacing: '2px',
  color: '#c9a84c',
  fontWeight: 'bold' as const,
  margin: '0 0 10px',
}
const promoTitle = { fontSize: '20px', color: '#ffffff', margin: '0 0 10px', lineHeight: '1.3' }
const promoText = { fontSize: '14px', color: '#bdbdbd', lineHeight: '1.6', margin: '0 0 18px' }
const promoButton = {
  backgroundColor: '#c9a84c',
  color: '#0d0d0d',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '10px',
  padding: '12px 22px',
  textDecoration: 'none',
  display: 'inline-block',
}

/* Footer */
const footer = {
  marginTop: '20px',
  padding: '28px 24px',
  backgroundColor: '#0a0a0a',
  borderRadius: '14px',
  textAlign: 'center' as const,
}
const footerBrand = {
  fontSize: '18px',
  letterSpacing: '4px',
  color: '#c9a84c',
  margin: '0 0 4px',
  fontWeight: 'bold' as const,
}
const footerTagline = { fontSize: '12px', color: '#9a9a9a', margin: '0 0 4px', letterSpacing: '1px' }
const footerHr = { borderColor: '#1f1f1f', margin: '20px 0 16px' }
const footerLinks = { fontSize: '13px', color: '#cfcfcf', margin: '0 0 16px' }
const footerLink = { color: '#c9a84c', textDecoration: 'none' }
const footerFine = { fontSize: '11px', color: '#7a7a7a', lineHeight: '1.6', margin: '4px 0' }
