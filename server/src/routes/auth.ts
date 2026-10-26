import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { audit } from "../lib/audit.js";
import { HttpError, parse, slugify } from "../lib/http.js";
import { MEMBER_CATEGORIES, ORGANIZATION_CATEGORIES } from "../lib/permissions.js";
import { clearSession, issueSession, requireAuth } from "../middleware/auth.js";
import { Organization, Role, User } from "../models/identity.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
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

function devLink(path: string) {
  return config.isProd ? undefined : `${config.appUrl}${path}`;
}

authRouter.post("/register", authLimiter, async (req, res) => {
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

  const verifyPath = `/verify-email?token=${verifyToken}&email=${encodeURIComponent(user.email)}`;
  // Email delivery is not configured; the link is logged for operators in development.
  if (!config.isProd) console.log(`[auth] Verification link for ${user.email}: ${config.appUrl}${verifyPath}`);

  res.status(201).json({
    message: active
      ? "Registration complete. Please verify your email to sign in."
      : "Registration received. Verify your email, and our team will review your application.",
    status: user.status,
    requiresVerification: config.requireEmailVerification,
    devVerificationUrl: config.requireEmailVerification ? devLink(verifyPath) : undefined,
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
  user.lastLoginAt = new Date();
  await user.save();
  issueSession(res, String(user._id), user.tokenVersion, !!remember);
  res.json({ ok: true });
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
    if (!config.isProd) console.log(`[auth] Verification link for ${email}: ${config.appUrl}${path}`);
    url = devLink(path);
  }
  res.json({ message: "If that account needs verification, a new link has been sent.", devVerificationUrl: url });
});

authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.post("/logout-all", requireAuth, async (req, res) => {
  await User.updateOne({ _id: req.user!._id }, { $inc: { tokenVersion: 1 } });
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
    if (!config.isProd) console.log(`[auth] Password reset link for ${email}: ${config.appUrl}${path}`);
    url = devLink(path);
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
    },
  });
});
