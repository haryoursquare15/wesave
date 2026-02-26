/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your WeSave verification code</Preview>
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
        <Heading style={h1}>Verify your identity</Heading>
        <Text style={text}>Use the code below to confirm it's you:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={text}>
          This code will expire shortly. If you didn't request this, you can safely ignore it.
        </Text>
        <Text style={footerBrand}>
          WeSave — Save Together, Grow Together 🌍
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const codeStyle = {
  fontFamily: "'Roboto Mono', Courier, monospace",
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: '#E8621A',
  margin: '0 0 28px',
  letterSpacing: '4px',
}
const footerBrand = { fontSize: '12px', color: '#E8621A', margin: '24px 0 0', fontWeight: '500' as const }
