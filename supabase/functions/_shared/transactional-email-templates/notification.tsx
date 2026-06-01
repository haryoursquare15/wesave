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
