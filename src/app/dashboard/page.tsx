import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  return <Dashboard user={user} clientId={process.env.GOOGLE_CLIENT_ID ?? ""} />;
}
