const destinations = [
  { to: "/tenants", label: "Tenants", names: /\btenants?\b/i },
  { to: "/properties", label: "Properties & units", names: /\b(properties|property|units?)\b/i },
  { to: "/payments", label: "Payments", names: /\b(payments?|transactions?|receipts?)\b/i },
  { to: "/billing", label: "Billing", names: /\b(billing|bills?|invoices?)\b/i },
  { to: "/performance", label: "History", names: /\b(history|portfolio|performance|analytics|statistics|reports?)\b/i },
  { to: "/messages", label: "Messages", names: /\b(messages?|texting|sms)\b/i },
  { to: "/maintenance", label: "Maintenance", names: /\b(maintenance|repairs?)\b/i },
  { to: "/meters", label: "Utilities", names: /\b(utilities|meters?)\b/i },
  { to: "/settings/account", label: "My Account", names: /\b(account|settings)\b/i },
  { to: "/", label: "Home", names: /\b(home|dashboard)\b/i },
] as const;

/** Only explicit page-opening requests; payment/message commands remain untouched. */
export function assistantDestination(text: string) {
  const q = text.trim();
  if (!/^(?:(?:please|can you|could you|i want you to|i want to)\s+)*(?:open|go to|take me to|navigate to|bring me to|show me)\b/i.test(q)) return null;
  if (/\b(send|remind|record|fix|change|delete|refund|pay)\b/i.test(q)) return null;
  if (/\bshow me\b/i.test(q) && !/\b(page|tab|screen|section)\b/i.test(q)) return null;
  return destinations.find(d => d.names.test(q)) ?? null;
}