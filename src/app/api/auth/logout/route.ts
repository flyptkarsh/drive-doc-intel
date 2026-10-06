import { ok, route } from "@/server/http";
import { destroySession } from "@/server/session";

export const POST = route(async () => {
  await destroySession();
  return ok();
});
