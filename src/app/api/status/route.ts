import { authedRoute, ok } from "@/server/http";
import { getSyncStatus } from "@/server/queries/connections";
import { isSyncing } from "@/server/sync";

export const GET = authedRoute(async (_req, user) =>
  ok(await getSyncStatus(user.id, isSyncing(user.id))),
);
