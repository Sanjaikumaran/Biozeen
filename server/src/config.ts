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
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024,
  requireApproval: process.env.REQUIRE_APPROVAL !== "false",
  requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== "false",
  sessionDays: 1,
  rememberDays: 30,
  cookieName: "bian_session",
};
