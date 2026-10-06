import { z } from "zod";
import { authedRoute, ok } from "@/server/http";
import { listPerformance } from "@/server/queries/performance";

const isoDate = z.iso.date().optional();
const Filters = z.object({
  fund: z.string().optional(),
  period_type: z.string().optional(),
  from: isoDate,
  to: isoDate,
});

/** Performance rows across all documents, filtered by fund, period type and period end. */
export const GET = authedRoute(async (req, user) => {
  const params = Object.fromEntries(
    [...new URL(req.url).searchParams].filter(([, value]) => value !== ""),
  );
  const { fund, period_type, from, to } = Filters.parse(params);
  return ok(await listPerformance(user.id, { fund, periodType: period_type, from, to }));
});
