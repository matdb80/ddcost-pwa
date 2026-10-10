export const Session = {
  cookieName: "ddcost_sid",
  maxAgeMs: 8 * 60 * 60 * 1000, // 8 hours
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;

export const Paths = {
  login: "/login",
  microsoftLogin: "/api/auth/microsoft/login",
  microsoftCallback: "/api/auth/microsoft/callback",
} as const;
