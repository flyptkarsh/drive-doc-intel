import { redirect } from "next/navigation";
import { FolderSync, ScanText, Sparkles, Table2 } from "lucide-react";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { Logo } from "@/components/logo";
import { Card, CardContent } from "@/components/ui/card";
import { publicGoogleClientId } from "@/server/env";
import { currentUser } from "@/server/session";

const FEATURES = [
  {
    icon: FolderSync,
    title: "Watches your folder",
    body: "Connect Google Drive and pick a folder. New factsheets are picked up automatically.",
  },
  {
    icon: ScanText,
    title: "No parsers to configure",
    body: "PDFs, HTML emails and CSVs from any manager are read by Claude and mapped to one schema.",
  },
  {
    icon: Table2,
    title: "One clean table",
    body: "Every return, benchmark and metric lands in a filterable table across all your funds.",
  },
  {
    icon: Sparkles,
    title: "Ask in plain English",
    body: "“Which fund had the best January return?” — answered from your data, with sources.",
  },
];

export default async function Home() {
  if (await currentUser()) redirect("/dashboard");
  const clientId = publicGoogleClientId();

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--color-muted),transparent_60%)]" />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
      </header>

      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-16 pb-12 text-center">
        <span className="mb-4 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          Document intelligence for fund reporting
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Messy factsheets in. Structured performance data out.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
          Point Folio at a Google Drive folder of statements and reports from different managers.
          See every return in one table, and ask questions across all of it.
        </p>
        <div className="mt-8">
          {clientId ? (
            <GoogleSignIn clientId={clientId} />
          ) : (
            <p className="text-sm text-destructive">GOOGLE_CLIENT_ID is not configured.</p>
          )}
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="bg-card/60 backdrop-blur">
            <CardContent className="space-y-2">
              <Icon className="size-5 text-muted-foreground" />
              <h2 className="font-medium">{title}</h2>
              <p className="text-sm text-muted-foreground">{body}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
