/**
 * Microsoft Entra ID OAuth 2.0 / OpenID Connect integration
 * Single-tenant, Authorization Code Flow with PKCE (S256)
 *
 * Security features:
 * - PKCE S256: code_challenge sent to authorize, code_verifier sent to token
 * - State cookie binding: random state value in URL parameter, JWT state cookie
 *   (HttpOnly, Secure, SameSite=Lax) binds the OAuth flow to the browser.
 * - Nonce verification: prevents replay attacks on ID tokens.
 * - Tenant verification: ensures only DIDIEFFE GROUP SRL users can access.
 * - OID authorization list: only configured Microsoft Object IDs are allowed.
 * - Session re-verification: allowed-OID and tenant checks run on every request.
 */

import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import * as jose from "jose";
import * as cookie from "cookie";
import { env } from "./lib/env";
import { getSessionCookieOptions } from "./lib/cookies";
import { Session } from "@contracts/constants";
import { signSessionToken, verifySessionToken } from "./kimi/session";
import { findUserByUnionId, upsertUser } from "./queries/users";
import { Errors } from "@contracts/errors";

// ─────────────────────────────────────────────────────────────
// Microsoft OIDC endpoints (single tenant)
// ─────────────────────────────────────────────────────────────

function getAuthorizeUrl(): string {
  return `https://login.microsoftonline.com/${env.microsoftTenantId}/oauth2/v2.0/authorize`;
}

function getTokenUrl(): string {
  return `https://login.microsoftonline.com/${env.microsoftTenantId}/oauth2/v2.0/token`;
}

function getJwksUrl(): string {
  return `https://login.microsoftonline.com/${env.microsoftTenantId}/discovery/v2.0/keys`;
}

const jwks = jose.createRemoteJWKSet(new URL(getJwksUrl()));

// ─────────────────────────────────────────────────────────────
// PKCE helpers
// ─────────────────────────────────────────────────────────────

function base64URLEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generatePKCE(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64URLEncode(verifierBytes);
  const challengeBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = base64URLEncode(challengeBytes);
  return { verifier, challenge };
}

// ─────────────────────────────────────────────────────────────
// Redirect safety (origin-checked)
// ─────────────────────────────────────────────────────────────

function isSafeRedirectPath(path: string): boolean {
  try {
    const url = new URL(path, env.appOrigin);
    return url.origin === env.appOrigin && url.pathname.startsWith("/");
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// OAuth state cookie (binds flow to browser)
// ─────────────────────────────────────────────────────────────

const OAUTH_STATE_COOKIE = "ddcost_oauth_state";
const OAUTH_STATE_MAX_AGE_SEC = 600; // 10 minutes

type OAuthStatePayload = {
  stateValue: string;
  redirectTo: string;
  nonce: string;
  pkceVerifier: string;
};

async function signOAuthState(state: OAuthStatePayload): Promise<string> {
  const secret = new TextEncoder().encode(env.appSecret);
  return new jose.SignJWT(state as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);
}

async function verifyOAuthState(
  token: string,
): Promise<OAuthStatePayload | null> {
  try {
    const secret = new TextEncoder().encode(env.appSecret);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: ["HS256"],
      clockTolerance: 30,
    });
    const stateValue = payload.stateValue as string | undefined;
    const redirectTo = payload.redirectTo as string | undefined;
    const nonce = payload.nonce as string | undefined;
    const pkceVerifier = payload.pkceVerifier as string | undefined;
    if (!stateValue || !redirectTo || !nonce || !pkceVerifier) return null;
    if (!isSafeRedirectPath(redirectTo)) return null;
    return { stateValue, redirectTo, nonce, pkceVerifier };
  } catch {
    return null;
  }
}

function getOAuthCookieOptions(): {
  httpOnly: boolean;
  path: string;
  sameSite: "Lax" | "Strict" | "None";
  secure: boolean;
} {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: env.isProduction,
  };
}

function setOAuthStateCookie(c: Context, value: string): void {
  const opts = getOAuthCookieOptions();
  setCookie(c, OAUTH_STATE_COOKIE, value, {
    ...opts,
    maxAge: OAUTH_STATE_MAX_AGE_SEC,
  });
}

function clearOAuthStateCookie(c: Context): void {
  const opts = getOAuthCookieOptions();
  setCookie(c, OAUTH_STATE_COOKIE, "", {
    ...opts,
    maxAge: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// Microsoft token exchange
// ─────────────────────────────────────────────────────────────

type MicrosoftTokenResponse = {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
};

async function exchangeMicrosoftCode(
  code: string,
  pkceVerifier: string,
): Promise<MicrosoftTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.microsoftClientId,
    client_secret: env.microsoftClientSecret,
    code,
    redirect_uri: env.microsoftRedirectUri,
    scope: "openid profile",
    code_verifier: pkceVerifier,
  });

  const resp = await fetch(getTokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    throw new Error(`Microsoft token exchange failed (${resp.status})`);
  }

  return resp.json() as Promise<MicrosoftTokenResponse>;
}

// ─────────────────────────────────────────────────────────────
// Verify Microsoft ID token
// ─────────────────────────────────────────────────────────────

type MicrosoftIdTokenClaims = {
  oid: string;
  tid: string;
  nonce?: string;
  name?: string;
  preferred_username?: string;
  email?: string;
};

async function verifyMicrosoftIdToken(
  idToken: string,
  expectedNonce: string,
): Promise<MicrosoftIdTokenClaims> {
  const { payload } = await jose.jwtVerify(idToken, jwks, {
    algorithms: ["RS256"],
    clockTolerance: 60,
    issuer: `https://login.microsoftonline.com/${env.microsoftTenantId}/v2.0`,
    audience: env.microsoftClientId,
  });

  const oid = payload.oid as string;
  const tid = payload.tid as string;
  const nonce = payload.nonce as string | undefined;

  if (!oid || !tid) {
    throw new Error("Microsoft ID token missing required claims");
  }

  if (tid !== env.microsoftTenantId) {
    throw new Error("Invalid tenant");
  }

  if (nonce !== expectedNonce) {
    throw new Error("Invalid nonce");
  }

  return {
    oid,
    tid,
    nonce,
    name: (payload.name as string) || undefined,
    preferred_username: (payload.preferred_username as string) || undefined,
    email: (payload.email as string) || undefined,
  };
}

// ─────────────────────────────────────────────────────────────
// Authorization helpers
// ─────────────────────────────────────────────────────────────

function isAuthorizedOid(oid: string): boolean {
  const allowed = env.allowedMicrosoftOids;
  return allowed.length > 0 && allowed.includes(oid);
}

function checkAllowedOid(oid: string): void {
  const allowed = env.allowedMicrosoftOids;
  if (allowed.length === 0) {
    throw new Error(
      "ALLOWED_MICROSOFT_OIDS is not configured. Blocking all logins.",
    );
  }
  if (!allowed.includes(oid)) {
    throw new Error("Access denied. Your account is not authorized.");
  }
}

// ─────────────────────────────────────────────────────────────
// Authenticate incoming request (session cookie)
// ─────────────────────────────────────────────────────────────

export async function authenticateRequest(headers: Headers) {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies[Session.cookieName];
  if (!token) {
    throw Errors.forbidden("Authentication required.");
  }

  const claim = await verifySessionToken(token);
  if (!claim) {
    throw Errors.forbidden("Invalid or expired session.");
  }

  // Verify tenant on every request
  if (claim.clientId !== env.microsoftTenantId) {
    throw Errors.forbidden("Invalid tenant session.");
  }

  const user = await findUserByUnionId(claim.unionId);
  if (!user) {
    throw Errors.forbidden("User not found. Please sign in again.");
  }

  // Re-verify authorization on every request (revocation support)
  if (!isAuthorizedOid(user.unionId)) {
    throw Errors.forbidden(
      "Access revoked. Your account is no longer authorized.",
    );
  }

  return user;
}

// ─────────────────────────────────────────────────────────────
// Hono route handlers
// ─────────────────────────────────────────────────────────────

export function createMicrosoftLoginHandler() {
  return async (c: Context) => {
    const rawRedirect = c.req.query("redirect_to") || "/";
    const redirectTo = isSafeRedirectPath(rawRedirect) ? rawRedirect : "/";

    const { verifier, challenge } = await generatePKCE();
    const nonce = crypto.randomUUID();
    const stateValue = crypto.randomUUID();

    const stateToken = await signOAuthState({
      stateValue,
      redirectTo,
      nonce,
      pkceVerifier: verifier,
    });

    setOAuthStateCookie(c, stateToken);

    const url = new URL(getAuthorizeUrl());
    url.searchParams.set("client_id", env.microsoftClientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", env.microsoftRedirectUri);
    url.searchParams.set("scope", "openid profile");
    url.searchParams.set("state", stateValue);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");

    return c.redirect(url.toString(), 302);
  };
}

export function createMicrosoftCallbackHandler() {
  return async (c: Context) => {
    const code = c.req.query("code");
    const stateParam = c.req.query("state");
    const error = c.req.query("error");

    // Always clear the temporary OAuth state cookie
    clearOAuthStateCookie(c);

    if (error) {
      console.error("[Microsoft OAuth] Authorization error:", error);
      return c.json({ error: "Authorization failed" }, 400);
    }

    if (!code || !stateParam) {
      return c.json({ error: "Missing code or state parameter" }, 400);
    }

    const cookies = cookie.parse(c.req.header("cookie") || "");
    const stateCookie = cookies[OAUTH_STATE_COOKIE];
    if (!stateCookie) {
      return c.json({ error: "Missing OAuth state cookie" }, 400);
    }

    const stateData = await verifyOAuthState(stateCookie);
    if (!stateData) {
      return c.json({ error: "Invalid or expired state" }, 400);
    }

    if (stateData.stateValue !== stateParam) {
      return c.json({ error: "State mismatch" }, 400);
    }

    let authPhase = "token_exchange";
    try {
      const tokenResp = await exchangeMicrosoftCode(
        code,
        stateData.pkceVerifier,
      );
      authPhase = "id_token_verification";
      const claims = await verifyMicrosoftIdToken(
        tokenResp.id_token,
        stateData.nonce,
      );

      // ── Authorization: only allowed OIDs may access ──
      authPhase = "oid_authorization";
      checkAllowedOid(claims.oid);

      // Upsert user in database (authorized users are admin)
      authPhase = "database_user_upsert";
      await upsertUser({
        unionId: claims.oid,
        name: claims.name || claims.preferred_username || "Microsoft User",
        email: claims.email || claims.preferred_username || null,
        role: "admin",
        lastSignInAt: new Date(),
      });

      // Create session JWT (unionId = Microsoft OID, clientId = Tenant ID)
      authPhase = "session_signing";
      const sessionToken = await signSessionToken({
        unionId: claims.oid,
        clientId: claims.tid,
      });

      const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
      setCookie(c, Session.cookieName, sessionToken, {
        ...cookieOpts,
        maxAge: Session.maxAgeMs / 1000,
      });

      return c.redirect(stateData.redirectTo, 302);
    } catch {
      // Stage-only diagnostic: log the step, never tokens, passwords, or DB URLs.
      if (env.appOrigin === "https://ddcost-collaudo.onrender.com") {
        console.error("[Microsoft OAuth] Callback failed at phase:", authPhase);
      } else {
        console.error("[Microsoft OAuth] Callback failed");
      }
      return c.json({ error: "Authentication failed" }, 500);
    }
  };
}
