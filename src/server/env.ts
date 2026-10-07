import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

/**
 * Typed access to configuration. Values are read lazily so that `next build`
 * works without runtime secrets; a missing required variable fails the first
 * request that needs it, with a clear message.
 */
export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get googleClientId() {
    return required("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return required("GOOGLE_CLIENT_SECRET");
  },
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  /** Encrypts stored Drive refresh tokens; falls back to the session secret. */
  get encryptionKey() {
    return optional("ENCRYPTION_KEY") ?? this.sessionSecret;
  },
  /** Comma-separated emails and/or `@domains`. Empty allows any Google account. */
  get allowedSignIns(): string[] {
    return (optional("ALLOWED_SIGNINS") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
  get cronSecret() {
    return optional("CRON_SECRET");
  },
  get syncIntervalSeconds() {
    return Math.max(15, Number(optional("SYNC_INTERVAL_SECONDS") ?? 60));
  },
  get pollerEnabled() {
    return optional("DISABLE_POLLER") !== "1";
  },
  get model() {
    return optional("CLAUDE_MODEL") ?? "claude-opus-5-5";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};

/** Variables the app can't run without, and what each one is for. */
export const REQUIRED_ENV: Record<string, string> = {
  DATABASE_URL: "Postgres connection string",
  GOOGLE_CLIENT_ID: "Google OAuth client ID (sign-in and Drive)",
  GOOGLE_CLIENT_SECRET: "Google OAuth client secret (Drive access)",
  ANTHROPIC_API_KEY: "Claude API key (extraction and Ask)",
  SESSION_SECRET: "random string that signs session cookies",
};

/** Required variables that are unset, with their descriptions. */
export function missingRequiredEnv(source: NodeJS.ProcessEnv = process.env): string[] {
  return Object.entries(REQUIRED_ENV)
    .filter(([name]) => !source[name])
    .map(([name, purpose]) => `${name}: ${purpose}`);
}

/** The OAuth client ID handed to the browser for Google Identity Services, if configured. */
export function publicGoogleClientId(): string | null {
  return optional("GOOGLE_CLIENT_ID") ?? null;
}

export function isSignInAllowed(email: string, allowList = env.allowedSignIns): boolean {
  if (allowList.length === 0) return true;
  const normalized = email.toLowerCase();
  return allowList.some((rule) =>
    rule.startsWith("@") ? normalized.endsWith(rule) : normalized === rule,
  );
}
