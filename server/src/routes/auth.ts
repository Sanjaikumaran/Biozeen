import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { audit } from "../lib/audit.js";
import { HttpError, parse, slugify } from "../lib/http.js";
import { sendMail } from "../lib/mailer.js";
import { MEMBER_CATEGORIES, ORGANIZATION_CATEGORIES, PERMISSIONS } from "../lib/permissions.js";
import { clearSession, issueSession, requireAuth } from "../middleware/auth.js";
import { Organization, Role, THEME_ACCENTS, THEME_MODES, User } from "../models/identity.js";
import { notifyPermission } from "../lib/notify.js";
import { disconnectUser } from "../lib/realtime.js";
import { requireFeature } from "../lib/features.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});

// Codes are also capped per challenge (OTP_MAX_ATTEMPTS); this limits guessing across challenges.
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const newToken = () => randomBytes(32).toString("hex");

const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Include letters and numbers");

/** Map a member category to the audience role assigned on approval. */
export const CATEGORY_ROLE: Record<string, string> = {
  startup: "startup",
  academia: "academia",
  industry: "industry",
  sme: "expert",
  alumni: "alumni",
  student: "student",
  professional: "professional",
  other: "member",
};

const registerSchema = z
  .object({
    category: z.enum(MEMBER_CATEGORIES),
    name: z.string().trim().min(2, "Enter your full name").max(120),
    email: z.string().trim().toLowerCase().email("Enter a valid email"),
    password,
    phone: z.string().trim().max(30).optional(),
    designation: z.string().trim().max(120).optional(),
    organizationName: z.string().trim().max(160).optional(),
    organizationWebsite: z.string().trim().max(300).optional(),
    organizationDescription: z.string().trim().max(2000).optional(),
    location: z.string().trim().max(120).optional(),
    institution: z.string().trim().max(160).optional(),
    graduationYear: z.coerce.number().int().min(1950).max(2100).optional(),
    expertise: z.string().trim().max(500).optional(),
    interests: z.array(z.string().trim().max(60)).max(20).default([]),
    acceptTerms: z.literal(true, { message: "Please accept the terms to continue" }),
  })
  .refine((d) => !ORGANIZATION_CATEGORIES.includes(d.category) || !!d.organizationName, {
    message: "Organization name is required",
    path: ["organizationName"],
  });

/** Links and codes are shown on screen only in development, and only when no email went out. */
function devLink(path: string, delivered: boolean) {
  return config.isProd || delivered ? undefined : `${config.appUrl}${path}`;
}

/** Email failures are logged rather than failing the request (the member can ask for a resend). */
const trySend = (mail: Parameters<typeof sendMail>[0]) =>
  sendMail(mail).catch((err) => {
    console.error(`[mail] Could not send "${mail.subject}" to ${mail.to}:`, err);
    return false;
  });

const verificationMail = (to: string, name: string, path: string) =>
  trySend({
    to,
    subject: "Verify your BIAN email address",
    text: `Hello ${name},\n\nPlease confirm your email address for the Biozeen Industry Academy Network:\n${config.appUrl}${path}\n\nIf you didn't create an account, you can ignore this email.`,
  });

authRouter.post("/register", authLimiter, requireFeature("registration"), async (req, res) => {
  const data = parse(registerSchema, req.body);
  if (await User.exists({ email: data.email })) {
    throw new HttpError(409, "An account with this email already exists", { email: "Already registered" });
  }
  const isOrg = ORGANIZATION_CATEGORIES.includes(data.category);

  let organizationId;
  if (isOrg && data.organizationName) {
    const existing = await Organization.findOne({ name: new RegExp(`^${data.organizationName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (existing) organizationId = existing._id;
    else {
      const baseSlug = slugify(data.organizationName) || "organization";
      const slug = (await Organization.exists({ slug: baseSlug })) ? `${baseSlug}-${newToken().slice(0, 6)}` : baseSlug;
      const org = await Organization.create({
        name: data.organizationName,
        slug,
        orgType: data.category as "academia" | "startup" | "industry",
        description: data.organizationDescription ?? "",
        website: data.organizationWebsite,
        location: data.location,
        contact: { name: data.name, email: data.email, phone: data.phone },
        status: "pending",
        visibility: "internal",
      });
      organizationId = org._id;
    }
  }

  const memberRole = await Role.findOne({ name: "member" });
  const verifyToken = newToken();
  const active = !config.requireApproval;
  const user = await User.create({
    email: data.email,
    passwordHash: await bcrypt.hash(data.password, 12),
    name: data.name,
    phone: data.phone,
    accountType: isOrg ? "organization" : "individual",
    category: data.category,
    organization: organizationId,
    profile: {
      designation: data.designation,
      location: data.location,
      institution: data.institution,
      graduationYear: data.graduationYear,
      bio: data.expertise,
      interests: data.interests,
    },
    roles: active && memberRole ? [memberRole._id] : [],
    status: active ? "active" : "pending",
    emailVerified: !config.requireEmailVerification,
    verifyTokenHash: hashToken(verifyToken),
  });

  if (!active) {
    await notifyPermission(PERMISSIONS.membersManage, { kind: "approval_needed", title: `New registration: ${user.name}`, body: `${user.category} · ${user.email}`, link: "/admin/approvals" });
  }
  const verifyPath = `/verify-email?token=${verifyToken}&email=${encodeURIComponent(user.email)}`;
  const delivered = config.requireEmailVerification ? await verificationMail(user.email, user.name, verifyPath) : false;

  res.status(201).json({
    message: active
      ? "Registration complete. Please verify your email to sign in."
      : "Registration received. Verify your email, and our team will review your application.",
    status: user.status,
    requiresVerification: config.requireEmailVerification,
    devVerificationUrl: config.requireEmailVerification ? devLink(verifyPath, delivered) : undefined,
  });
});

authRouter.post("/verify-email", authLimiter, async (req, res) => {
  const { token, email } = parse(z.object({ token: z.string().min(10), email: z.string().email() }), req.body);
  const user = await User.findOne({ email: email.toLowerCase() }).select("+verifyTokenHash");
  if (!user || !user.verifyTokenHash || user.verifyTokenHash !== hashToken(token)) {
    throw new HttpError(400, "This verification link is invalid or has already been used");
  }
  user.emailVerified = true;
  user.verifyTokenHash = undefined;
  await user.save();
  res.json({ message: "Email verified.", status: user.status });
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
  remember: z.boolean().optional(),
});

const STATUS_MESSAGES: Record<string, string> = {
  pending: "Your registration is awaiting approval by the BIAN team.",
  suspended: "Your account has been suspended. Please contact the BIAN secretariat.",
  inactive: "Your account is inactive. Please contact the BIAN secretariat.",
  rejected: "Your registration was not approved. Please contact the BIAN secretariat.",
};

authRouter.post("/login", authLimiter, async (req, res) => {
  const { email, password: pw, remember } = parse(loginSchema, req.body);
  const user = await User.findOne({ email }).select("+passwordHash");
  // Same message for unknown email and wrong password to avoid account enumeration.
  if (!user || !(await bcrypt.compare(pw, user.passwordHash))) {
    throw new HttpError(401, "Incorrect email or password");
  }
  if (config.requireEmailVerification && !user.emailVerified) {
    throw new HttpError(403, "Please verify your email address before signing in", { code: "unverified" });
  }
  if (user.status !== "active") throw new HttpError(403, STATUS_MESSAGES[user.status] ?? "Account unavailable");

  if (config.loginOtp) {
    const challenge = newToken();
    user.otpChallengeHash = hashToken(challenge);
    user.otpRemember = !!remember;
    const devCode = await sendLoginCode(user);
    return res.json({ otpRequired: true, challenge, email: maskEmail(user.email), expiresInMinutes: config.otpMinutes, devCode });
  }

  user.lastLoginAt = new Date();
  await user.save();
  issueSession(res, String(user._id), user.tokenVersion, !!remember);
  res.json({ ok: true });
});

const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 30;

function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

const otpHash = (challenge: string, code: string) => createHash("sha256").update(`${config.jwtSecret}:${challenge}:${code}`).digest("hex");

/** Issue a fresh 6-digit code for the user's pending challenge. Returns the code only in development without email. */
async function sendLoginCode(user: InstanceType<typeof User>) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // The challenge itself is only known to the browser; bind the code to its hash.
  user.otpCodeHash = otpHash(user.otpChallengeHash!, code);
  user.otpExpires = new Date(Date.now() + config.otpMinutes * 60 * 1000);
  user.otpAttempts = 0;
  user.otpSentAt = new Date();
  await user.save();
  let delivered: boolean;
  try {
    delivered = await sendMail({
      to: user.email,
      subject: `${code} is your BIAN sign-in code`,
      text: `Hello ${user.name},\n\nYour BIAN sign-in code is ${code}. It expires in ${config.otpMinutes} minutes.\n\nIf you didn't try to sign in, change your password.`,
    });
  } catch (err) {
    console.error(`[mail] Could not send sign-in code to ${user.email}:`, err);
    throw new HttpError(502, "We couldn't send your sign-in code. Please try again shortly.");
  }
  return config.isProd || delivered ? undefined : code;
}

const OTP_FIELDS = "+otpChallengeHash +otpCodeHash +otpExpires +otpAttempts +otpSentAt +otpRemember";

async function findChallenge(challenge: string) {
  const user = await User.findOne({ otpChallengeHash: hashToken(challenge) }).select(OTP_FIELDS);
  if (!user || !user.otpExpires || user.otpExpires < new Date()) {
    throw new HttpError(400, "This sign-in code has expired. Please sign in again.", { code: "otp_expired" });
  }
  return user;
}

const clearOtp = (user: InstanceType<typeof User>) => {
  user.otpChallengeHash = undefined;
  user.otpCodeHash = undefined;
  user.otpExpires = undefined;
  user.otpAttempts = undefined;
  user.otpSentAt = undefined;
  user.otpRemember = undefined;
};

authRouter.post("/login/otp", otpLimiter, async (req, res) => {
  const { challenge, code } = parse(
    z.object({ challenge: z.string().min(10), code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }),
    req.body,
  );
  const user = await findChallenge(challenge);
  const expected = Buffer.from(user.otpCodeHash ?? "");
  const given = Buffer.from(otpHash(user.otpChallengeHash!, code));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    user.otpAttempts = (user.otpAttempts ?? 0) + 1;
    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      clearOtp(user);
      await user.save();
      throw new HttpError(400, "Too many incorrect codes. Please sign in again.", { code: "otp_expired" });
    }
    await user.save();
    throw new HttpError(400, `Incorrect code. ${OTP_MAX_ATTEMPTS - user.otpAttempts} attempts left.`, { code: "Incorrect code" });
  }
  // Re-check the account: it may have been suspended since the password step.
  if (user.status !== "active") throw new HttpError(403, STATUS_MESSAGES[user.status] ?? "Account unavailable");
  const remember = !!user.otpRemember;
  clearOtp(user);
  user.lastLoginAt = new Date();
  await user.save();
  issueSession(res, String(user._id), user.tokenVersion, remember);
  res.json({ ok: true });
});

authRouter.post("/login/otp/resend", otpLimiter, async (req, res) => {
  const { challenge } = parse(z.object({ challenge: z.string().min(10) }), req.body);
  const user = await findChallenge(challenge);
  const wait = user.otpSentAt ? OTP_RESEND_SECONDS - Math.floor((Date.now() - user.otpSentAt.getTime()) / 1000) : 0;
  if (wait > 0) throw new HttpError(429, `Please wait ${wait} seconds before requesting another code.`);
  const devCode = await sendLoginCode(user);
  res.json({ message: `A new code has been sent to ${maskEmail(user.email)}.`, devCode });
});

authRouter.post("/resend-verification", authLimiter, async (req, res) => {
  const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email() }), req.body);
  const user = await User.findOne({ email });
  let url: string | undefined;
  if (user && !user.emailVerified) {
    const token = newToken();
    user.verifyTokenHash = hashToken(token);
    await user.save();
    const path = `/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
    url = devLink(path, await verificationMail(email, user.name, path));
  }
  res.json({ message: "If that account needs verification, a new link has been sent.", devVerificationUrl: url });
});

authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.post("/logout-all", requireAuth, async (req, res) => {
  await User.updateOne({ _id: req.user!._id }, { $inc: { tokenVersion: 1 } });
  disconnectUser(req.user!.id);
  clearSession(res);
  res.json({ ok: true });
});

authRouter.post("/forgot-password", authLimiter, async (req, res) => {
  const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email") }), req.body);
  const user = await User.findOne({ email });
  let url: string | undefined;
  if (user) {
    const token = newToken();
    user.resetTokenHash = hashToken(token);
    user.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const path = `/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    const delivered = await trySend({
      to: email,
      subject: "Reset your BIAN password",
      text: `Hello ${user.name},\n\nUse this link within one hour to choose a new password:\n${config.appUrl}${path}\n\nIf you didn't ask for this, you can ignore this email.`,
    });
    url = devLink(path, delivered);
  }
  res.json({ message: "If an account exists for that email, a reset link has been sent.", devResetUrl: url });
});

authRouter.post("/reset-password", authLimiter, async (req, res) => {
  const { token, email, password: pw } = parse(
    z.object({ token: z.string().min(10), email: z.string().email(), password }),
    req.body,
  );
  const user = await User.findOne({ email: email.toLowerCase() }).select("+resetTokenHash +resetTokenExpires");
  if (!user?.resetTokenHash || user.resetTokenHash !== hashToken(token) || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
    throw new HttpError(400, "This reset link is invalid or has expired");
  }
  user.passwordHash = await bcrypt.hash(pw, 12);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  user.tokenVersion += 1;
  await user.save();
  await audit(req, "password.reset", "User", user._id, `Password reset for ${user.email}`);
  res.json({ message: "Password updated. You can now sign in." });
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = parse(
    z.object({ currentPassword: z.string().min(1), newPassword: password }),
    req.body,
  );
  const user = await User.findById(req.user!._id).select("+passwordHash");
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Current password is incorrect", { currentPassword: "Incorrect password" });
  }
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.tokenVersion += 1;
  await user.save();
  issueSession(res, String(user._id), user.tokenVersion, false);
  res.json({ message: "Password changed. Other sessions have been signed out." });
});

authRouter.get("/me", async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const user = await User.findById(req.user._id).populate("organization", "name slug orgType").lean();
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      category: req.user.category,
      accountType: req.user.accountType,
      organization: user?.organization ?? null,
      roles: req.user.roleNames,
      permissions: [...req.user.permissions],
      profile: user?.profile ?? {},
      phone: user?.phone,
      preferences: { themeMode: user?.preferences?.themeMode ?? null, accent: user?.preferences?.accent ?? null },
      isDeveloper: req.user.isDeveloper,
    },
  });
});

authRouter.put("/me/preferences", requireAuth, requireFeature("appearance"), async (req, res) => {
  const data = parse(z.object({ themeMode: z.enum(THEME_MODES), accent: z.enum(THEME_ACCENTS) }), req.body);
  await User.updateOne({ _id: req.user!._id }, { $set: { preferences: data } });
  res.json({ preferences: data });
});
