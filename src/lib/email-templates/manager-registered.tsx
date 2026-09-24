import React from "react";
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section } from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  landlordName?: string;
  managerName?: string;
  managerPhone?: string;
  properties?: string;
  needsApproval?: boolean;
  newAccount?: boolean;
}

const Email = ({ landlordName, managerName, managerPhone, properties, needsApproval, newAccount }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${managerName ?? "A property manager"} registered to manage your property`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>A property manager registered for your property</Heading>
        <Text style={text}>{landlordName ? `Hi ${landlordName},` : "Hi there,"}</Text>
        <Text style={text}>
          {managerName ?? "A property manager"}
          {managerPhone ? ` (${managerPhone})` : ""} has registered on Rotich Management Systems to manage your
          property and record rent payments for you.
        </Text>
        {properties ? (
          <Section style={box}>
            <Text style={label}>Properties</Text>
            <Text style={value}>{properties}</Text>
          </Section>
        ) : null}
        {needsApproval ? (
          <Text style={text}>
            They can't see anything yet. Sign in, open Settings → Property Managers and switch their access on to
            approve them.
          </Text>
        ) : (
          <Text style={text}>
            You can sign in any time to track every payment your manager records, see tenants and arrears, and pause
            their access.
          </Text>
        )}
        {newAccount ? (
          <Text style={text}>
            We created a free landlord login for this email. To set your password, open the sign-in page, tap
            "Forgot your password?" and use your phone number — we'll text you a code.
          </Text>
        ) : null}
        <Button href="https://homebasemanager.app/auth" style={button}>Sign in to track payments</Button>
        <Text style={muted}>If you don't know this person, pause their access from Settings → Property Managers.</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: "A property manager registered for your property",
  displayName: "Manager registered (to landlord)",
  previewData: { landlordName: "Jane", managerName: "Peter Otieno", managerPhone: "0712 345 678", properties: "Sunrise Apartments", needsApproval: true },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Figtree, Arial, sans-serif" };
const container = { padding: "28px 24px", maxWidth: "520px" };
const h1 = { color: "#172333", fontSize: "22px", fontWeight: 700, margin: "0 0 16px" };
const text = { color: "#344054", fontSize: "15px", lineHeight: "24px", margin: "0 0 14px" };
const muted = { color: "#667085", fontSize: "13px", lineHeight: "20px", marginTop: "20px" };
const box = { backgroundColor: "#F6F8FA", borderRadius: "8px", padding: "12px 16px", margin: "8px 0 20px" };
const label = { color: "#667085", fontSize: "12px", margin: 0 };
const value = { color: "#172333", fontSize: "16px", fontWeight: 700, margin: "4px 0 0" };
const button = { backgroundColor: "#1597A8", color: "#ffffff", borderRadius: "8px", padding: "12px 20px", fontSize: "15px", fontWeight: 600, textDecoration: "none" };
