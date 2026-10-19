import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, MessageCircle, Smartphone, Bell, Bot, FileSignature, Wallet, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLogo } from "@/components/app-logo";
import appShots from "@/assets/landing-app.jpg";

const NAME = "Eden Point Real Estate";
const WA = `https://wa.me/254706747498?text=${encodeURIComponent(`Hi, I'd like to know more about ${NAME}.`)}`;
const TITLE = `${NAME} — Rent collection app for Kenyan landlords`;
const DESC = "Collect rent by M-Pesa, send automatic SMS reminders and track every tenant's balance. KES 2,400/month with a 14-day free trial.";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://homebasemanager.app/welcome" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://homebasemanager.app/welcome" }],
  }),
  component: Welcome,
});

const features = [
  { icon: Wallet, t: "M-Pesa rent collection", d: "Tenants pay by M-Pesa prompt and balances update on their own." },
  { icon: Bell, t: "Automatic SMS reminders", d: "Polite reminders before and after due dates, stopping once rent is paid." },
  { icon: Users, t: "Every tenant in one place", d: "See who is paid ahead, balanced or in arrears, property by property." },
  { icon: Bot, t: "Rent assistant", d: "Paste an M-Pesa message and it records the payment after you confirm." },
  { icon: FileSignature, t: "Leases signed by phone", d: "Send a lease link; tenants sign once and it is locked." },
  { icon: Smartphone, t: "Works on your phone", d: "Install it like an app on Android or iPhone." },
];

function Welcome() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center gap-2 py-4 pl-4 pr-16">
        <AppLogo className="h-8 w-8" />
        <span className="font-semibold">{NAME}</span>
        <Button asChild variant="ghost" size="sm" className="ml-auto"><Link to="/auth">Sign in</Link></Button>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-12 pt-6 md:grid-cols-2">
        <div>
          <p className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">14-day free trial · no card needed</p>
          <h1 className="text-3xl font-bold leading-tight md:text-5xl">Stop chasing rent in notebooks and WhatsApp.</h1>
          <p className="mt-4 text-muted-foreground">{NAME} collects rent by M-Pesa, reminds tenants by SMS and shows every balance at a glance — built for Kenyan landlords and property managers.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link to="/auth">Start free trial</Link></Button>
            <Button asChild size="lg" variant="outline">
              <a href={WA} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-2 h-4 w-4" />Chat on WhatsApp</a>
            </Button>
          </div>
        </div>
        <img src={appShots} alt={`${NAME} app screens: rent dashboard and tenant list`} width={1280} height={896} className="w-full rounded-2xl shadow-lg" />
      </section>

      <section className="bg-muted/40 py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold">Everything you need to run your rentals</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.t} className="rounded-xl border bg-card p-5">
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-semibold">{f.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-bold">Simple pricing</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            { t: "Landlords", p: "KES 2,400", u: "per month", items: ["All properties and tenants", "M-Pesa collection & SMS reminders", "Rent assistant and reports"] },
            { t: "Property managers", p: "KES 250", u: "per property / month", items: ["Manage properties for landlords", "Landlord approval built in", "Switch between properties"] },
          ].map((plan) => (
            <div key={plan.t} className="rounded-xl border bg-card p-6">
              <h3 className="font-semibold">{plan.t}</h3>
              <p className="mt-2"><span className="text-3xl font-bold">{plan.p}</span> <span className="text-sm text-muted-foreground">{plan.u}</span></p>
              <ul className="mt-4 space-y-2 text-sm">
                {plan.items.map((i) => <li key={i} className="flex gap-2"><Check className="h-4 w-4 text-primary" />{i}</li>)}
              </ul>
              <Button asChild className="mt-5 w-full"><Link to="/auth">Try free for 14 days</Link></Button>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} {NAME} · <a href={WA} className="underline" target="_blank" rel="noopener noreferrer">WhatsApp +254 706 747 498</a>
      </footer>
    </div>
  );
}
