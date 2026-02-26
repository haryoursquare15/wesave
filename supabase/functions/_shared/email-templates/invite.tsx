/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join WeSave!</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Img
            src="https://sdwkqwmqgpsjrmijkdix.supabase.co/storage/v1/object/public/email-assets/wesave-logo.png"
            width="48"
            height="48"
            alt="WeSave"
            style={logo}
          />
        </Section>
        <Heading style={h1}>You've been invited! 🤝</Heading>
        <Text style={text}>
          Someone wants you to join{' '}
          <Link href={siteUrl} style={link}>
            <strong>WeSave</strong>
          </Link>{' '}
          — the trusted Ajo/Esusu platform where you save together and grow together.
        </Text>
        <Text style={text}>
          Accept the invitation below to create your account and start your thrift journey:
        </Text>
        <Section style={buttonSection}>
          <Button style={button} href={confirmationUrl}>
            Accept Invitation
          </Button>
        </Section>
        <Text style={footer}>
          If you weren't expecting this, you can safely ignore it.
        </Text>
        <Text style={footerBrand}>
          WeSave — Save Together, Grow Together 🌍
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Roboto', Arial, sans-serif" }
const container = { padding: '32px 28px' }
const logoSection = { marginBottom: '24px' }
const logo = { borderRadius: '8px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#171717',
  margin: '0 0 16px',
}
const text = {
  fontSize: '15px',
  color: '#555555',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const link = { color: '#E8621A', textDecoration: 'underline' }
const buttonSection = { margin: '0 0 28px' }
const button = {
  backgroundColor: '#E8621A',
  color: '#FFF5EB',
  fontSize: '15px',
  fontWeight: '600' as const,
  borderRadius: '12px',
  padding: '14px 28px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '24px 0 8px' }
const footerBrand = { fontSize: '12px', color: '#E8621A', margin: '0', fontWeight: '500' as const }
