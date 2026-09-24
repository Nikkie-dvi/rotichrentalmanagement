import React from "react";
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section } from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  name?: string;
  landlordCode?: string;
}

const Email = ({ name, landlordCode }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to Rotich Management Systems</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Welcome to Rotich Management Systems</Heading>
        <Text style={text}>{name ? `Hi ${name},` : "Hi there,"}</Text>
        <Text style={text}>
          Your landlord account is ready. Add your properties, units and tenants, and start tracking rent,
          utilities and payments in one place.
        </Text>
        {landlordCode ? (
          <Section style={codeBox}>
            <Text style={codeLabel}>Your landlord code</Text>
            <Text style={code}>{landlordCode}</Text>
          </Section>
        ) : null}
        <Button href="https://homebasemanager.app" style={button}>Open your dashboard</Button>
        <Text style={muted}>Your phone number is used for password reset codes by SMS.</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: "Welcome to Rotich Management Systems",
  displayName: "Landlord welcome",
  previewData: { name: "Jane", landlordCode: "RMS-1234" },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Figtree, Arial, sans-serif" };
const container = { padding: "28px 24px", maxWidth: "520px" };
const h1 = { color: "#172333", fontSize: "22px", fontWeight: 700, margin: "0 0 16px" };
const text = { color: "#344054", fontSize: "15px", lineHeight: "24px", margin: "0 0 14px" };
const muted = { color: "#667085", fontSize: "13px", lineHeight: "20px", marginTop: "20px" };
const codeBox = { backgroundColor: "#F6F8FA", borderRadius: "8px", padding: "12px 16px", margin: "8px 0 20px" };
const codeLabel = { color: "#667085", fontSize: "12px", margin: 0 };
const code = { color: "#172333", fontSize: "20px", fontWeight: 700, letterSpacing: "1px", margin: "4px 0 0" };
const button = { backgroundColor: "#1597A8", color: "#ffffff", borderRadius: "8px", padding: "12px 20px", fontSize: "15px", fontWeight: 600, textDecoration: "none" };
