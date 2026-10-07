import { parse } from "libpg-query";

/**
 * Guard for SQL written by the model in the Ask agent.
 *
 * The query is parsed with the real PostgreSQL parser and accepted only if it is
 * a single SELECT that reads nothing but the user-scoped tables (or CTEs it
 * defines itself) and calls nothing but allowlisted functions. An allowlist over
 * the syntax tree can't be dodged with quoting, comments or string building the
 * way pattern matching on the SQL text can.
 */

/** The relations the model may read; each is shadowed by a CTE filtered to the user. */
export const SCOPED_TABLES = ["documents", "funds", "performance", "metrics"] as const;

/** Ordinary, side-effect-free functions the model may call. */
const ALLOWED_FUNCTIONS = new Set([
  // aggregates
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "stddev",
  "stddev_pop",
  "stddev_samp",
  "variance",
  "var_pop",
  "var_samp",
  "percentile_cont",
  "percentile_disc",
  "mode",
  "string_agg",
  "array_agg",
  "bool_and",
  "bool_or",
  "every",
  "json_agg",
  "jsonb_agg",
  "corr",
  "covar_pop",
  "covar_samp",
  "regr_slope",
  "regr_intercept",
  // window functions
  "row_number",
  "rank",
  "dense_rank",
  "percent_rank",
  "cume_dist",
  "ntile",
  "lag",
  "lead",
  "first_value",
  "last_value",
  "nth_value",
  // math
  "abs",
  "round",
  "trunc",
  "ceil",
  "ceiling",
  "floor",
  "power",
  "sqrt",
  "exp",
  "ln",
  "log",
  "sign",
  "mod",
  "width_bucket",
  // dates and times
  "extract",
  "date_part",
  "date_trunc",
  "to_char",
  "to_date",
  "to_timestamp",
  "make_date",
  "age",
  "timezone",
  "overlaps",
  // text
  "lower",
  "upper",
  "initcap",
  "length",
  "char_length",
  "substring",
  "substr",
  "trim",
  "btrim",
  "ltrim",
  "rtrim",
  "replace",
  "concat",
  "concat_ws",
  "left",
  "right",
  "position",
  "strpos",
  "split_part",
  "regexp_replace",
  "regexp_match",
  "regexp_like",
  "format",
  "to_number",
  "starts_with",
  "overlay",
  "normalize",
  // json
  "json_build_object",
  "jsonb_build_object",
  "json_build_array",
  "jsonb_build_array",
]);

/** current_date and friends are fine; current_user, session_user etc. are not needed. */
const ALLOWED_SQL_VALUE_FUNCTIONS =
  /^SVFOP_(CURRENT_DATE|CURRENT_TIMESTAMP|LOCALTIMESTAMP|CURRENT_TIME|LOCALTIME)/;

/** Syntax that is never valid in an Ask query. */
const FORBIDDEN_NODES: Record<string, string> = {
  RangeFunction: "functions in FROM are not allowed",
  LockingClause: "row locking (FOR UPDATE/SHARE) is not allowed",
  lockingClause: "row locking (FOR UPDATE/SHARE) is not allowed",
  intoClause: "SELECT INTO is not allowed",
};

export class UnsafeQueryError extends Error {
  override name = "UnsafeQueryError";
}

type Node = Record<string, unknown>;

function nameOf(parts: unknown): string[] {
  return (parts as { String?: { sval: string } }[]).map((p) => p.String?.sval ?? "");
}

/** Names of every CTE defined anywhere in the tree (`WITH x AS (...)`). */
function collectCteNames(node: unknown, names: Set<string>): Set<string> {
  if (Array.isArray(node)) node.forEach((child) => collectCteNames(child, names));
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Node)) {
      if (key === "CommonTableExpr") names.add(String((value as Node).ctename).toLowerCase());
      collectCteNames(value, names);
    }
  }
  return names;
}

function check(node: unknown, allowedRelations: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((child) => check(child, allowedRelations));
    return;
  }
  if (!node || typeof node !== "object") return;

  for (const [key, value] of Object.entries(node as Node)) {
    if (key in FORBIDDEN_NODES) throw new UnsafeQueryError(`Not allowed: ${FORBIDDEN_NODES[key]}.`);
    // Any statement other than SELECT, at any depth: e.g. DELETE inside a CTE. These
    // name their target table without a RangeVar wrapper, so reject them outright.
    if (key.endsWith("Stmt") && key !== "SelectStmt") {
      throw new UnsafeQueryError("Only SELECT queries are allowed.");
    }

    if (key === "RangeVar") {
      const v = value as Node;
      if (v.schemaname || v.catalogname) {
        throw new UnsafeQueryError("Schema-qualified table names are not allowed.");
      }
      if (!allowedRelations.has(String(v.relname))) {
        throw new UnsafeQueryError(
          `Unknown table "${String(v.relname)}". Available: ${SCOPED_TABLES.join(", ")}.`,
        );
      }
    }

    if (key === "FuncCall") {
      const parts = nameOf((value as Node).funcname);
      const name = parts[parts.length - 1].toLowerCase();
      // SQL-syntax forms (EXTRACT, SUBSTRING ... FROM, AT TIME ZONE) parse as pg_catalog.<fn>.
      const qualifierOk = parts.length === 1 || (parts.length === 2 && parts[0] === "pg_catalog");
      if (!qualifierOk || !ALLOWED_FUNCTIONS.has(name)) {
        throw new UnsafeQueryError(`Function "${parts.join(".")}" is not allowed.`);
      }
    }

    if (key === "SQLValueFunction") {
      const op = String((value as Node).op ?? "");
      if (!ALLOWED_SQL_VALUE_FUNCTIONS.test(op)) {
        throw new UnsafeQueryError("That built-in value is not allowed.");
      }
    }

    check(value, allowedRelations);
  }
}

/**
 * Validates model-written SQL. Returns the query (without a trailing semicolon)
 * if it is safe to run inside the user-scoped wrapper, otherwise throws
 * UnsafeQueryError with a message the model can act on.
 */
export async function validateQuery(query: string): Promise<string> {
  const text = query.trim().replace(/;+\s*$/, "");
  let statements;
  try {
    statements = (await parse(text)).stmts ?? [];
  } catch (err) {
    throw new UnsafeQueryError(`SQL syntax error: ${(err as Error).message}`);
  }
  if (statements.length !== 1) throw new UnsafeQueryError("Send exactly one SQL statement.");
  const stmt = statements[0].stmt as Node | undefined;
  if (!stmt || !("SelectStmt" in stmt)) {
    throw new UnsafeQueryError("Only SELECT queries are allowed.");
  }

  const allowedRelations = collectCteNames(stmt, new Set(SCOPED_TABLES));
  check(stmt, allowedRelations);
  return text;
}
