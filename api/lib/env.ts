import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

function parseAllowedOids(): string[] {
  const raw = process.env.ALLOWED_MICROSOFT_OIDS ?? "";
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getAppOrigin(): string {
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI ?? "";
  if (!redirectUri) return "";
  try {
    return new URL(redirectUri).origin;
  } catch {
    return "";
  }
}

export const env = {
  appId: process.env.APP_ID ?? "",
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  kimiAuthUrl: process.env.KIMI_AUTH_URL ?? "",
  kimiOpenUrl: process.env.KIMI_OPEN_URL ?? "",
  ownerUnionId: process.env.OWNER_UNION_ID ?? "",
  microsoftClientId: required("MICROSOFT_CLIENT_ID"),
  microsoftClientSecret: required("MICROSOFT_CLIENT_SECRET"),
  microsoftTenantId: required("MICROSOFT_TENANT_ID"),
  allowedMicrosoftOids: parseAllowedOids(),
  microsoftRedirectUri: required("MICROSOFT_REDIRECT_URI"),
  appOrigin: getAppOrigin(),
};
