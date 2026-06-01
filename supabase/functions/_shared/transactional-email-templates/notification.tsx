/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Hr, Link,
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

const Notification = ({
  recipientName = 'there',
  title = 'You have a new update',
  message = 'You have a new notification from WeSave.',
  actionUrl,
  actionLabel = 'Open WeSave',
  unsubscribeUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{title}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={brand}>WeSave</Heading>
        <Heading style={h1}>{title}</Heading>
        <Text style={text}>Hi {recipientName},</Text>
        <Text style={text}>{message}</Text>
        {actionUrl ? (
          <Button style={button} href={actionUrl}>{actionLabel}</Button>
        ) : null}
        <Hr style={hr} />
        <Text style={footer}>
          You're receiving this because you have a WeSave account.
          {unsubscribeUrl ? (
            <>
              {' '}
              <Link href={unsubscribeUrl} style={link}>Unsubscribe</Link>
            </>
          ) : null}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Notification,
  displayName: 'Notification',
  subject: (data: Props) => data?.title || 'New notification from WeSave',
  previewData: {
    recipientName: 'Ada',
    title: 'New contribution received',
    message: 'Your group "Lagos Savers" just received ₦5,000. Great teamwork!',
    actionUrl: 'https://app.wesave.ng/dashboard',
    actionLabel: 'View in WeSave',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: '#0f3460', margin: '0 0 16px', letterSpacing: '1px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#3a3a3a', lineHeight: '1.55', margin: '0 0 16px' }
const button = { backgroundColor: '#0f3460', color: '#ffffff', fontSize: '14px', borderRadius: '10px', padding: '12px 22px', textDecoration: 'none', display: 'inline-block', marginTop: '8px' }
const hr = { borderColor: '#e5e7eb', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#888', lineHeight: '1.5', margin: '0' }
const link = { color: '#0f3460', textDecoration: 'underline' }
