import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { authEmailStyles as styles } from './auth-email-styles'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email for {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.brandBar}>{siteName}</Section>
        <Heading style={styles.heading}>Confirm your email</Heading>
        <Text style={styles.text}>
          Thanks for signing up for{' '}
          <Link href={siteUrl} style={styles.link}>
            <strong>{siteName}</strong>
          </Link>
          !
        </Text>
        <Text style={styles.text}>
          Please confirm your email address (
          <Link href={`mailto:${recipient}`} style={styles.link}>
            {recipient}
          </Link>
          ) by clicking the button below:
        </Text>
        <Button style={styles.button} href={confirmationUrl}>
          Verify email
        </Button>
        <Text style={styles.footer}>
          If you didn't create an account, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

