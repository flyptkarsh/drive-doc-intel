import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard/dashboard";
import { publicGoogleClientId } from "@/server/env";
import { currentUser } from "@/server/session";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  return <Dashboard user={user} clientId={publicGoogleClientId() ?? ""} />;
}
