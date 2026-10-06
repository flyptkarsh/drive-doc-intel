import "server-only";
import { OAuth2Client } from "google-auth-library";
import { DRIVE_SCOPE } from "@/lib/constants";
import { env } from "./env";
import { HttpError } from "./http";

/**
 * OAuth client for codes issued by the Google Identity Services popup
 * (`google.accounts.oauth2.initCodeClient`), whose redirect URI is "postmessage".
 */
export function oauthClient(): OAuth2Client {
  return new OAuth2Client(env.googleClientId, env.googleClientSecret, "postmessage");
}

export type GoogleProfile = {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
};

/** Verifies a Google One Tap / Sign in with Google ID token. */
export async function verifyIdToken(credential: string): Promise<GoogleProfile> {
  const ticket = await new OAuth2Client(env.googleClientId)
    .verifyIdToken({ idToken: credential, audience: env.googleClientId })
    .catch(() => {
      throw new HttpError(401, "Google sign-in could not be verified.");
    });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw new HttpError(401, "Your Google account needs a verified email address.");
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}

/** Exchanges an authorization code for a Drive refresh token. */
export async function exchangeDriveCode(
  code: string,
): Promise<{ refreshToken: string; email: string | null }> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code).catch(() => {
    throw new HttpError(400, "Google rejected the authorization code. Please try again.");
  });
  if (!tokens.scope?.split(" ").includes(DRIVE_SCOPE)) {
    throw new HttpError(400, "Google Drive access wasn't granted.");
  }
  if (!tokens.refresh_token) {
    throw new HttpError(
      400,
      "Google didn't return a refresh token. Remove the app's access at " +
        "myaccount.google.com/permissions and connect again.",
    );
  }
  let email: string | null = null;
  if (tokens.id_token) {
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token });
    email = ticket.getPayload()?.email ?? null;
  }
  return { refreshToken: tokens.refresh_token, email };
}

/** Revokes a refresh token. Failures are logged, not thrown: the grant may already be gone. */
export async function revokeToken(refreshToken: string): Promise<void> {
  await oauthClient()
    .revokeToken(refreshToken)
    .catch((err: Error) => console.warn("Google token revocation failed:", err.message));
}
