/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Column,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

/**
 * Shared Vestara email shell.
 *
 * Presentation only — no data, amounts or logic are computed here.
 * Layout is table-based (React Email Section/Row/Column render to <table>)
 * with inline styles only, so it renders reliably in Outlook, Gmail,
 * Apple Mail and basic HTML clients.
 */

export const BRAND = {
  navy: '#0B2C5F',
  navyDeep: '#082144',
  green: '#6CC24A',
  greenSoft: '#8DD65F',
  gold: '#F5B921',
  ink: '#132239',
  body: '#4a5568',
  muted: '#98a7bd',
  border: '#e3e9f2',
  surface: '#f6f9fc',
}

export const APP_URL = 'https://vestara.ng'
export const LOGO_URL =
  'https://vestara.ng/__l5e/assets-v1/833d06eb-58c2-42da-9af9-e4a7a732febe/vestara-logo.jpg'

export const COMPANY_ADDRESS = 'Vestara Technologies, Lagos, Nigeria'
export const SUPPORT_EMAIL = 'support@vestara.ng'

const SOCIALS = [
  { label: 'X', href: 'https://x.com/vestara_ng' },
  { label: 'IG', href: 'https://instagram.com/vestara.ng' },
  { label: 'in', href: 'https://www.linkedin.com/company/vestara' },
  { label: 'FB', href: 'https://facebook.com/vestara.ng' },
]

interface ShellProps {
  preview: string
  children: React.ReactNode
  /** Shown as "Hello {greetingName}," directly under the header. */
  greetingName?: string
  /** Closing line above the signature. */
  signOff?: string
  /** Show the "we will never ask for your PIN/OTP/BVN" trust block. */
  securityNotice?: boolean
  /** Show Play Store / App Store badges in the footer. */
  showAppBadges?: boolean
  unsubscribeUrl?: string
}

export const EmailShell = ({
  preview,
  children,
  greetingName,
  signOff = 'Thank you for banking with Vestara.',
  securityNotice = true,
  showAppBadges = false,
  unsubscribeUrl,
}: ShellProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={outer}>
        <Container style={container}>
          {/* ---------- Header ---------- */}
          <Section style={header}>
            <Row>
              <Column style={{ width: '56px', verticalAlign: 'middle' }}>
                <Img src={LOGO_URL} alt="Vestara" width="48" height="48" style={logo} />
              </Column>
              <Column style={{ verticalAlign: 'middle' }}>
                <Text style={wordmark}>Vestara</Text>
                <Text style={tagline}>Grow Your Money Smarter</Text>
              </Column>
              <Column style={{ textAlign: 'right' as const, verticalAlign: 'middle' }}>
                <Link href={`${APP_URL}/support`} style={headerLink}>
                  Help Centre
                </Link>
              </Column>
            </Row>
          </Section>
          <Section style={headerRule} />

          {/* ---------- Content ---------- */}
          <Section style={content}>
            {greetingName ? <Text style={greeting}>Hello {greetingName},</Text> : null}
            {children}
            {signOff ? (
              <>
                <Text style={signOffText}>{signOff}</Text>
                <Text style={signature}>— The Vestara Team</Text>
              </>
            ) : null}
          </Section>

          {/* ---------- Security notice ---------- */}
          {securityNotice ? (
            <Section style={securityBox}>
              <Text style={securityTitle}>Your security matters</Text>
              <Text style={securityCopy}>
                Vestara will <strong>never</strong> ask for your PIN, password, OTP or BVN by phone
                call, email, SMS or social media. If anyone asks, it is a scam — end the
                conversation and report it to{' '}
                <Link href={`mailto:${SUPPORT_EMAIL}`} style={securityLink}>
                  {SUPPORT_EMAIL}
                </Link>
                .
              </Text>
            </Section>
          ) : null}

          {/* ---------- Footer ---------- */}
          <Section style={footer}>
            <Row>
              <Column style={footerCol}>
                <Text style={footerBrand}>Vestara</Text>
                <Text style={footerTagline}>Grow Your Money Smarter</Text>
                <Text style={footerCopy}>
                  Making everyday payments, savings and group finance simple, secure and
                  convenient.
                </Text>
                <Text style={footerAddress}>{COMPANY_ADDRESS}</Text>
              </Column>
              <Column style={footerCol}>
                <Text style={footerHeading}>Quick Links</Text>
                <Text style={footerItem}>
                  <Link href={`${APP_URL}/wallet`} style={footerLink}>
                    Pay a Bill
                  </Link>
                </Text>
                <Text style={footerItem}>
                  <Link href={`${APP_URL}/wallet`} style={footerLink}>
                    Airtime &amp; Data
                  </Link>
                </Text>
                <Text style={footerItem}>
                  <Link href={`${APP_URL}/splitpay`} style={footerLink}>
                    Split Bill
                  </Link>
                </Text>
                <Text style={footerItem}>
                  <Link href={`${APP_URL}/support`} style={footerLink}>
                    Help Centre
                  </Link>
                </Text>
              </Column>
            </Row>

            {/* social icons */}
            <Section style={socialBar}>
              <Row>
                {SOCIALS.map((s) => (
                  <Column key={s.label} style={socialCell}>
                    <Link href={s.href} style={socialIcon}>
                      {s.label}
                    </Link>
                  </Column>
                ))}
              </Row>
            </Section>

            {showAppBadges ? (
              <Section style={{ textAlign: 'center' as const, padding: '4px 0 2px' }}>
                <Link href={`${APP_URL}/download`} style={storeBadge}>
                  Get it on Google Play
                </Link>
                <Link href={`${APP_URL}/download`} style={storeBadge}>
                  Download on the App Store
                </Link>
              </Section>
            ) : null}

            <Section style={footerBar}>
              <Text style={footerFine}>Secure&nbsp; •&nbsp; Fast&nbsp; •&nbsp; Reliable</Text>
              <Text style={footerFine}>
                © {new Date().getFullYear()} Vestara. All rights reserved.
              </Text>
              <Text style={footerFine}>
                You're receiving this email because you have a Vestara account.
              </Text>
              <Text style={footerFine}>
                {unsubscribeUrl ? (
                  <>
                    <Link href={unsubscribeUrl} style={footerLegalLink}>
                      Unsubscribe
                    </Link>
                    {'   |   '}
                  </>
                ) : null}
                <Link href={`${APP_URL}/privacy-policy`} style={footerLegalLink}>
                  Privacy Policy
                </Link>
                {'   |   '}
                <Link href={`${APP_URL}/terms`} style={footerLegalLink}>
                  Terms &amp; Conditions
                </Link>
              </Text>
            </Section>
          </Section>
        </Container>
      </Container>
    </Body>
  </Html>
)

/* ---------- shared content helpers ---------- */

export const EmailHeading = ({ children }: { children: React.ReactNode }) => (
  <Text style={h1}>{children}</Text>
)

export const EmailText = ({ children }: { children: React.ReactNode }) => (
  <Text style={paragraph}>{children}</Text>
)

/** Table-based CTA button — renders as a real button in Outlook. */
export const EmailButton = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Section style={{ margin: '26px 0 10px' }}>
    <Row>
      <Column style={buttonCell}>
        <Link href={href} style={button}>
          {children}
        </Link>
      </Column>
    </Row>
  </Section>
)

/** Highlighted headline figure (amount, code, status). */
export const EmailHighlight = ({ label, value }: { label?: string; value: string }) => (
  <Section style={highlightBox}>
    {label ? <Text style={highlightLabel}>{label}</Text> : null}
    <Text style={highlightValue}>{value}</Text>
  </Section>
)

export const DetailList = ({ items }: { items: { label?: string; value?: string }[] }) => (
  <Section style={detailBox}>
    {items.map((d, i) => (
      <Row key={i} style={i === 0 ? undefined : detailRow}>
        <Column style={detailLabel}>{d?.label ?? ''}</Column>
        <Column style={detailValue}>{d?.value ?? ''}</Column>
      </Row>
    ))}
  </Section>
)

/* ---------- styles ---------- */
const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif',
  margin: 0,
  padding: '0',
}
const outer = { backgroundColor: BRAND.surface, maxWidth: '100%', padding: '24px 0' }
const container = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '0',
  backgroundColor: '#ffffff',
  border: `1px solid ${BRAND.border}`,
  borderRadius: '14px',
  overflow: 'hidden' as const,
}
const header = { padding: '20px 24px 16px', backgroundColor: '#ffffff' }
const logo = { display: 'block', borderRadius: '10px' }
const wordmark = {
  fontSize: '20px',
  fontWeight: 'bold' as const,
  color: BRAND.navy,
  margin: 0,
  lineHeight: '1.1',
}
const tagline = {
  fontSize: '10px',
  color: BRAND.green,
  margin: '2px 0 0',
  fontWeight: 'bold' as const,
}
const headerLink = {
  fontSize: '12px',
  color: BRAND.navy,
  textDecoration: 'none',
  fontWeight: 'bold' as const,
}
const headerRule = {
  height: '5px',
  background: `linear-gradient(90deg, ${BRAND.green} 0%, ${BRAND.navy} 60%, ${BRAND.gold} 100%)`,
  backgroundColor: BRAND.navy,
  lineHeight: '5px',
  fontSize: '1px',
}
const content = { padding: '30px 28px 30px', backgroundColor: '#ffffff' }

const greeting = {
  fontSize: '15px',
  color: BRAND.ink,
  fontWeight: 'bold' as const,
  margin: '0 0 14px',
}
const h1 = { fontSize: '21px', fontWeight: 'bold' as const, color: BRAND.ink, margin: '0 0 16px' }
const paragraph = { fontSize: '15px', color: BRAND.body, lineHeight: '1.65', margin: '0 0 14px' }
const signOffText = { fontSize: '15px', color: BRAND.body, lineHeight: '1.65', margin: '22px 0 4px' }
const signature = {
  fontSize: '15px',
  color: BRAND.navy,
  fontWeight: 'bold' as const,
  margin: '0',
}

const buttonCell = {
  backgroundColor: BRAND.navy,
  borderRadius: '10px',
  textAlign: 'center' as const,
  padding: '0',
}
const button = {
  backgroundColor: BRAND.navy,
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '10px',
  padding: '14px 26px',
  textDecoration: 'none',
  display: 'block',
  textAlign: 'center' as const,
}

const highlightBox = {
  backgroundColor: BRAND.surface,
  border: `1px solid ${BRAND.border}`,
  borderLeft: `4px solid ${BRAND.green}`,
  borderRadius: '10px',
  padding: '14px 16px',
  margin: '18px 0',
}
const highlightLabel = {
  fontSize: '11px',
  letterSpacing: '1.2px',
  textTransform: 'uppercase' as const,
  color: BRAND.muted,
  fontWeight: 'bold' as const,
  margin: '0 0 4px',
}
const highlightValue = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: BRAND.navy,
  margin: 0,
  lineHeight: '1.2',
}

const detailBox = {
  backgroundColor: BRAND.surface,
  border: `1px solid ${BRAND.border}`,
  borderRadius: '10px',
  padding: '6px 16px',
  margin: '18px 0 4px',
}
const detailRow = { borderTop: `1px solid ${BRAND.border}` }
const detailLabel = {
  fontSize: '13px',
  color: BRAND.muted,
  padding: '11px 8px 11px 0',
  verticalAlign: 'top' as const,
}
const detailValue = {
  fontSize: '13px',
  color: BRAND.ink,
  fontWeight: 'bold' as const,
  textAlign: 'right' as const,
  padding: '11px 0',
  verticalAlign: 'top' as const,
}

const securityBox = {
  backgroundColor: '#fff8e6',
  borderTop: `1px solid ${BRAND.border}`,
  borderBottom: `1px solid ${BRAND.border}`,
  padding: '18px 28px',
}
const securityTitle = {
  fontSize: '12px',
  letterSpacing: '1.2px',
  textTransform: 'uppercase' as const,
  color: '#8a6100',
  fontWeight: 'bold' as const,
  margin: '0 0 6px',
}
const securityCopy = { fontSize: '13px', color: '#6b5220', lineHeight: '1.65', margin: 0 }
const securityLink = { color: '#8a6100', textDecoration: 'underline' }

const footer = { backgroundColor: BRAND.navy, padding: '28px 26px 0' }
const footerCol = { verticalAlign: 'top' as const, paddingRight: '16px', width: '50%' }
const footerBrand = { fontSize: '18px', fontWeight: 'bold' as const, color: '#ffffff', margin: 0 }
const footerTagline = {
  fontSize: '10px',
  color: BRAND.green,
  margin: '2px 0 12px',
  fontWeight: 'bold' as const,
}
const footerCopy = { fontSize: '12px', color: '#c3d0e2', lineHeight: '1.6', margin: 0 }
const footerAddress = { fontSize: '11px', color: '#93a6c2', lineHeight: '1.6', margin: '10px 0 0' }
const footerHeading = {
  fontSize: '11px',
  letterSpacing: '1.5px',
  textTransform: 'uppercase' as const,
  color: BRAND.green,
  fontWeight: 'bold' as const,
  margin: '0 0 10px',
}
const footerItem = { margin: '0 0 8px', fontSize: '13px' }
const footerLink = { color: '#ffffff', textDecoration: 'none', fontSize: '13px' }
const socialBar = { padding: '20px 0 6px' }
const socialCell = { textAlign: 'center' as const }
const socialIcon = {
  display: 'inline-block',
  width: '30px',
  height: '30px',
  lineHeight: '30px',
  borderRadius: '15px',
  backgroundColor: '#12386f',
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: 'bold' as const,
  textAlign: 'center' as const,
  textDecoration: 'none',
}
const storeBadge = {
  display: 'inline-block',
  border: '1px solid #2b5290',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '11px',
  fontWeight: 'bold' as const,
  padding: '9px 14px',
  margin: '6px 5px 0',
  textDecoration: 'none',
}
const footerBar = {
  borderTop: '1px solid #1c4076',
  marginTop: '18px',
  padding: '16px 0 22px',
  textAlign: 'center' as const,
}
const footerFine = { fontSize: '11px', color: '#93a6c2', lineHeight: '1.7', margin: '2px 0' }
const footerLegalLink = { color: BRAND.green, textDecoration: 'none' }
