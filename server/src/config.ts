import "dotenv/config";
import path from "node:path";

const isProd = process.env.NODE_ENV === "production";

function required(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProd) throw new Error(`${name} is missing from environment`);
  return devFallback;
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 5000,
  mongoUri: required("MONGO_URI", "mongodb://127.0.0.1:27017/bian"),
  jwtSecret: required("JWT_SECRET", "dev-only-insecure-secret-change-me"),
  clientOrigins: (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? "uploads"),
  /** Database export used by `npm run db:export` / `db:import` and first-start initialisation. */
  dataDir: path.resolve(process.env.DB_DATA_DIR ?? "../db/data"),
  /** On start, fill an empty database from db/data (or the sample seed when there is no export). */
  autoInitDb: process.env.AUTO_INIT_DB !== "false",
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024,
  requireApproval: process.env.REQUIRE_APPROVAL !== "false",
  requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== "false",
  /** Outgoing email. While disabled, messages are written to the server log instead of being sent. */
  email: {
    enabled: process.env.EMAIL_ENABLED === "true",
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.MAIL_FROM ?? "BIAN <no-reply@bian.local>",
  },
  /** Ask for a one-time code sent by email after the password at sign-in. */
  loginOtp: process.env.LOGIN_OTP_ENABLED === "true",
  otpMinutes: Number(process.env.LOGIN_OTP_MINUTES) || 10,
  /** Developer console account, created on start if missing (see maintenance.ts). */
  developer: {
    email: (process.env.DEVELOPER_EMAIL ?? "").trim().toLowerCase(),
    password: process.env.DEVELOPER_PASSWORD ?? "",
  },
  sessionDays: 1,
  rememberDays: 30,
  cookieName: "bian_session",
};
