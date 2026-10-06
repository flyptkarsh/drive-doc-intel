import "server-only";
import postgres from "postgres";
import { env } from "./env";
import { SCHEMA } from "./schema";

export type Sql = postgres.Sql;
export type Transaction = postgres.TransactionSql;

// Cached on globalThis so dev-mode hot reloads reuse one pool.
const cache = globalThis as unknown as {
  __sql?: Sql;
  __schemaReady?: Promise<void>;
};

const PG_NUMERIC = 1700;
const PG_DATE = 1082;

function connect(): Sql {
  const url = env.databaseUrl;
  const isLocal = /@?(localhost|127\.0\.0\.1)[:/]/.test(url);
  return postgres(url, {
    max: 10,
    ssl: isLocal ? false : "prefer",
    transform: { undefined: null },
    onnotice: () => {},
    types: {
      // numeric → number (values here are returns and metrics, well within float range)
      numeric: { to: PG_NUMERIC, from: [PG_NUMERIC], serialize: String, parse: Number },
      // date → "YYYY-MM-DD" string, avoiding timezone shifts from Date objects
      date: { to: PG_DATE, from: [PG_DATE], serialize: String, parse: (x: string) => x },
    },
  });
}

/** Raw client without the schema check; used by the schema bootstrap itself. */
export function rawSql(): Sql {
  cache.__sql ??= connect();
  return cache.__sql;
}

/** Applies the idempotent schema once per process. */
export function ensureSchema(): Promise<void> {
  cache.__schemaReady ??= rawSql()
    .unsafe(SCHEMA)
    .then(() => undefined)
    .catch((err) => {
      cache.__schemaReady = undefined;
      throw err;
    });
  return cache.__schemaReady;
}

/** The database client, with the schema guaranteed to exist. */
export async function db(): Promise<Sql> {
  await ensureSchema();
  return rawSql();
}
