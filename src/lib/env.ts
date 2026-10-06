function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

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
  // Optional: comma-separated emails and/or @domains allowed to sign in.
  // Empty means anyone with a Google account can sign in.
  get allowedSignIns(): string[] {
    return (process.env.ALLOWED_SIGNINS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
  },
  get syncIntervalSeconds() {
    return Number(process.env.SYNC_INTERVAL_SECONDS ?? 60);
  },
  get model() {
    return process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
  },
};

export function isSignInAllowed(email: string): boolean {
  const allow = env.allowedSignIns;
  if (allow.length === 0) return true;
  const e = email.toLowerCase();
  return allow.some((rule) =>
    rule.startsWith("@") ? e.endsWith(rule) : e === rule,
  );
}
