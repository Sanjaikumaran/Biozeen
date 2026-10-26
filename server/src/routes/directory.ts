import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { audit } from "../lib/audit.js";
import { safeUrl } from "../lib/blocks.js";
import { HttpError, isId, notFound, oid, paged, pagination, parse, searchRegex, slugify, str, toCsv, type Filter } from "../lib/http.js";
import { PERMISSIONS } from "../lib/permissions.js";
import { can, requireAuth, requirePermission } from "../middleware/auth.js";
import { ContactRequest } from "../models/admin.js";
import { EXPERT_TYPES, Expert } from "../models/learning.js";
import { Organization, Role, User } from "../models/identity.js";
import { notify, notifyPermission } from "../lib/notify.js";
import { audienceFilter } from "../lib/access.js";
import { accessInput } from "../lib/publishing.js";
import { requireFeature } from "../lib/features.js";

export const partnersRouter = Router();
export const expertsRouter = Router();
export const adminDirectoryRouter = Router();

// ---------------------------------------------------------------- partners (public)

const PUBLIC_ORG_FIELDS = "name slug orgType partnerTier description logoUrl website location collaborationAreas initiatives";
const publicOrgFilter: Filter = { visibility: "public", status: "approved" };

partnersRouter.get("/", requireFeature("partners"), async (req, res) => {
  const { page, limit, skip } = pagination(req, 24);
  const f: Filter = { ...publicOrgFilter };
  const tier = str(req.query.tier);
  if (tier) f.partnerTier = tier;
  const type = str(req.query.type);
  if (type) f.orgType = type;
  const q = str(req.query.q);
  if (q) f.$or = [{ name: searchRegex(q) }, { description: searchRegex(q) }, { collaborationAreas: searchRegex(q) }];
  const [items, total, tiers] = await Promise.all([
    Organization.find(f).select(PUBLIC_ORG_FIELDS).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Organization.countDocuments(f),
    Organization.aggregate<{ _id: string; n: number }>([{ $match: publicOrgFilter }, { $group: { _id: "$partnerTier", n: { $sum: 1 } } }]),
  ]);
  res.json({ ...paged(items, total, page, limit), tiers: Object.fromEntries(tiers.map((t) => [t._id, t.n])) });
});

partnersRouter.get("/:slug", requireFeature("partners.profiles"), async (req, res) => {
  const org = await Organization.findOne({ slug: req.params.slug, ...publicOrgFilter }).select(PUBLIC_ORG_FIELDS).lean();
  if (!org) throw notFound("Partner");
  res.json(org);
});

// ---------------------------------------------------------------- experts (public / members)

/** Experts the viewer may find: approved, and within the audience the expert chose. */
export function expertVisibility(user?: Express.Request["user"]): Filter {
  if (can(user, PERMISSIONS.expertsManage)) return {};
  return { status: "approved", ...audienceFilter(user) };
}

type ExpertLean = Record<string, unknown> & { shareEmail?: boolean; user?: unknown };

function presentExpert(e: ExpertLean, viewer?: Express.Request["user"]) {
  const u = (e.user ?? {}) as { _id?: unknown; name?: string; email?: string; organization?: unknown };
  const showEmail = !!viewer && (e.shareEmail || can(viewer, PERMISSIONS.expertsManage));
  const { shareEmail: _s, user: _u, ...rest } = e;
  return { ...rest, name: u.name, organization: u.organization, email: showEmail ? u.email : undefined };
}

expertsRouter.get("/", requireFeature("experts"), async (req, res) => {
  const { page, limit, skip } = pagination(req, 12);
  const f: Filter = { ...expertVisibility(req.user) };
  const type = str(req.query.type);
  if (type) f.expertType = type;
  const domain = str(req.query.domain);
  if (domain) f.domain = searchRegex(domain);
  const location = str(req.query.location);
  if (location) f.location = searchRegex(location);
  const expertise = str(req.query.expertise);
  if (expertise) f.$or = [{ skills: searchRegex(expertise) }, { expertiseAreas: searchRegex(expertise) }];
  const minYears = Number(req.query.minYears);
  if (minYears > 0) f.yearsExperience = { $gte: minYears };
  if (req.query.mentoring === "true") f.mentoringAvailable = true;
  const q = str(req.query.q);
  if (q) {
    const users = await User.find({ name: searchRegex(q) }).select("_id").lean();
    f.$and = [{ $or: [{ headline: searchRegex(q) }, { skills: searchRegex(q) }, { expertiseAreas: searchRegex(q) }, { domain: searchRegex(q) }, { user: { $in: users.map((u) => u._id) } }] }];
  }
  const [items, total, domains] = await Promise.all([
    Expert.find(f).populate({ path: "user", select: "name email organization", populate: { path: "organization", select: "name slug" } }).sort({ yearsExperience: -1, _id: 1 }).skip(skip).limit(limit).lean(),
    Expert.countDocuments(f),
    Expert.distinct("domain", expertVisibility(req.user)),
  ]);
  res.json({ ...paged(items.map((e) => presentExpert(e as ExpertLean, req.user)), total, page, limit), domains: domains.filter(Boolean).sort() });
});

/** Roles and organisations a member may choose when limiting who can see their expert profile. */
expertsRouter.get("/audience-options", requireAuth, requireFeature("experts.selfProfile"), async (_req, res) => {
  const [roles, organizations] = await Promise.all([
    Role.find({ permissions: { $ne: PERMISSIONS.adminAccess } }).select("name displayName").sort({ displayName: 1 }).lean(),
    Organization.find({ status: "approved" }).select("name").sort({ name: 1 }).lean(),
  ]);
  res.json({ roles, organizations, forms: [] });
});

expertsRouter.get("/:id", requireFeature("experts"), async (req, res) => {
  const expert = await Expert.findOne({ _id: oid(String(req.params.id)), ...expertVisibility(req.user) })
    .populate({ path: "user", select: "name email organization", populate: { path: "organization", select: "name slug" } })
    .lean();
  if (!expert) throw notFound("Expert");
  res.json(presentExpert(expert as ExpertLean, req.user));
});

const connectLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, message: { error: "Too many requests. Please try again later." } });

expertsRouter.post("/:id/connect", connectLimiter, requirePermission(PERMISSIONS.expertsContact), requireFeature("experts.connect"), async (req, res) => {
  const expert = await Expert.findOne({ _id: oid(String(req.params.id)), ...expertVisibility(req.user) }).populate("user", "name").lean();
  if (!expert) throw notFound("Expert");
  const { purpose, message } = parse(
    z.object({
      purpose: z.enum(["mentoring", "consultancy", "collaboration", "training", "other"]),
      message: z.string().trim().min(20, "Tell the expert a little more (20+ characters)").max(3000),
    }),
    req.body,
  );
  const expertName = (expert.user as { name?: string } | null)?.name ?? "expert";
  const request = await ContactRequest.create({
    type: "expert_connect",
    name: req.user!.name,
    email: req.user!.email,
    category: req.user!.category,
    subject: `${purpose} request for ${expertName}`,
    message,
    user: req.user!._id,
    targetExpert: expert._id,
  });
  await notifyPermission(PERMISSIONS.contactsManage, {
    kind: "request",
    title: `${req.user!.name} wants to connect with ${expertName}`,
    body: `${purpose[0]!.toUpperCase()}${purpose.slice(1)} request`,
    link: `/admin/requests?open=${request._id}`,
  });
  res.status(201).json({ _id: request._id, message: "Request sent. The BIAN secretariat will coordinate the introduction." });
});

// ---------------------------------------------------------------- self-service expert profile

const expertSelfInput = z.object({
  headline: z.string().trim().min(5, "Add a short headline").max(160),
  bio: z.string().trim().max(4000).optional(),
  expertType: z.enum(EXPERT_TYPES),
  domain: z.string().trim().max(120).optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  expertiseAreas: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  yearsExperience: z.number().int().min(0).max(70).optional(),
  location: z.string().trim().max(120).optional(),
  access: accessInput,
  shareEmail: z.boolean().default(false),
  mentoringAvailable: z.boolean().default(false),
});

expertsRouter.get("/me/profile", requireAuth, requireFeature("experts.selfProfile"), async (req, res) => {
  res.json(await Expert.findOne({ user: req.user!._id }).lean());
});

expertsRouter.put("/me/profile", requireAuth, requireFeature("experts.selfProfile"), async (req, res) => {
  const data = parse(expertSelfInput, req.body);
  const existing = await Expert.findOne({ user: req.user!._id });
  if (existing) {
    existing.set(data);
    await existing.save();
    return res.json(existing);
  }
  const created = await Expert.create({ ...data, user: req.user!._id, status: "pending" });
  await notifyPermission(PERMISSIONS.expertsManage, { kind: "approval_needed", title: `Expert profile to review: ${req.user!.name}`, body: created.headline, link: "/admin/experts" }, req.user!._id);
  res.status(201).json(created);
});

// ---------------------------------------------------------------- admin: organizations & experts

const orgInput = z.object({
  name: z.string().trim().min(2, "Name is required").max(160),
  orgType: z.enum(["industry", "academia", "startup", "research", "innovation", "government", "other"]),
  partnerTier: z.enum(["founding", "knowledge", "industry", "innovation", "none"]).default("none"),
  description: z.string().max(3000).optional(),
  logoUrl: z.string().max(500).optional(),
  website: z.string().max(300).optional(),
  location: z.string().max(160).optional(),
  contact: z.object({ name: z.string().max(120).optional(), email: z.string().max(200).optional(), phone: z.string().max(40).optional() }).optional(),
  collaborationAreas: z.array(z.string().trim().max(80)).max(30).optional(),
  initiatives: z.array(z.object({ title: z.string().max(200), description: z.string().max(1000).optional(), year: z.number().int().optional() })).max(50).optional(),
  visibility: z.enum(["public", "internal"]),
  status: z.enum(["pending", "approved", "inactive"]),
});

const orgsAdmin = Router();
orgsAdmin.use(requirePermission(PERMISSIONS.adminAccess, PERMISSIONS.organizationsManage), requireFeature("admin.directory"));

function orgFilter(query: Record<string, unknown>) {
  const f: Filter = {};
  for (const key of ["orgType", "partnerTier", "status", "visibility"]) {
    const v = str(query[key]);
    if (v) f[key] = v;
  }
  const q = str(query.q);
  if (q) f.$or = [{ name: searchRegex(q) }, { "contact.name": searchRegex(q) }, { "contact.email": searchRegex(q) }];
  return f;
}

orgsAdmin.get("/", async (req, res) => {
  const { page, limit, skip } = pagination(req, 20);
  const f = orgFilter(req.query);
  const sortKey = ["name", "createdAt", "status"].includes(String(req.query.sort)) ? String(req.query.sort) : "name";
  const [items, total] = await Promise.all([
    Organization.find(f).sort({ [sortKey]: sortKey === "createdAt" ? -1 : 1 }).skip(skip).limit(limit).lean(),
    Organization.countDocuments(f),
  ]);
  res.json(paged(items, total, page, limit));
});

orgsAdmin.get("/export.csv", async (req, res) => {
  const items = await Organization.find(orgFilter(req.query)).sort({ name: 1 }).lean();
  const rows = items.map((o) => ({ name: o.name, orgType: o.orgType, partnerTier: o.partnerTier, contactName: o.contact?.name, contactEmail: o.contact?.email, website: o.website, location: o.location, status: o.status, visibility: o.visibility, createdAt: o.createdAt }));
  await audit(req, "export", "Organization", null, `Exported ${rows.length} organizations`);
  res.type("text/csv").attachment("organizations.csv").send(toCsv(rows, ["name", "orgType", "partnerTier", "contactName", "contactEmail", "website", "location", "status", "visibility", "createdAt"]));
});

orgsAdmin.post("/", async (req, res) => {
  const data = parse(orgInput, req.body);
  let slug = slugify(data.name) || "organization";
  for (let i = 2; await Organization.exists({ slug }); i++) slug = `${slugify(data.name)}-${i}`;
  const org = await Organization.create({ ...data, slug, logoUrl: safeUrl(data.logoUrl), website: safeUrl(data.website) });
  await audit(req, "organization.create", "Organization", org._id, `Created organization "${org.name}"`);
  res.status(201).json(org);
});

orgsAdmin.put("/:id", async (req, res) => {
  const data = parse(orgInput, req.body);
  const org = await Organization.findById(oid(String(req.params.id)));
  if (!org) throw notFound("Organization");
  const before = { status: org.status, visibility: org.visibility, partnerTier: org.partnerTier };
  org.set({ ...data, logoUrl: safeUrl(data.logoUrl), website: safeUrl(data.website) });
  await org.save();
  await audit(req, "organization.update", "Organization", org._id, `Updated organization "${org.name}"`, { before, after: { status: org.status, visibility: org.visibility, partnerTier: org.partnerTier } });
  res.json(org);
});

orgsAdmin.delete("/:id", async (req, res) => {
  const id = oid(String(req.params.id));
  if (await User.exists({ organization: id })) {
    throw new HttpError(409, "Members are linked to this organization. Mark it inactive instead.");
  }
  const org = await Organization.findByIdAndDelete(id);
  if (!org) throw notFound("Organization");
  await audit(req, "organization.delete", "Organization", org._id, `Deleted organization "${org.name}"`);
  res.json({ ok: true });
});

const expertsAdmin = Router();
expertsAdmin.use(requirePermission(PERMISSIONS.adminAccess, PERMISSIONS.expertsManage), requireFeature("admin.experts"));

async function expertFilter(query: Record<string, unknown>) {
  const f: Filter = {};
  for (const key of ["expertType", "status"]) {
    const v = str(query[key]);
    if (v) f[key] = v;
  }
  const visibility = str(query.visibility);
  if (visibility) f["access.visibility"] = visibility;
  const q = str(query.q);
  if (q) {
    const users = await User.find({ $or: [{ name: searchRegex(q) }, { email: searchRegex(q) }] }).select("_id").lean();
    f.$or = [{ headline: searchRegex(q) }, { skills: searchRegex(q) }, { user: { $in: users.map((u) => u._id) } }];
  }
  return f;
}

expertsAdmin.get("/", async (req, res) => {
  const { page, limit, skip } = pagination(req, 20);
  const f = await expertFilter(req.query);
  const [items, total] = await Promise.all([
    Expert.find(f).populate("user", "name email category").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Expert.countDocuments(f),
  ]);
  res.json(paged(items, total, page, limit));
});

expertsAdmin.get("/export.csv", async (req, res) => {
  const items = await Expert.find(await expertFilter(req.query)).populate<{ user: { name: string; email: string } }>("user", "name email").lean();
  const rows = items.map((e) => ({ name: e.user?.name, email: e.user?.email, headline: e.headline, expertType: e.expertType, domain: e.domain, skills: e.skills.join("; "), yearsExperience: e.yearsExperience, location: e.location, visibility: e.access?.visibility, status: e.status }));
  await audit(req, "export", "Expert", null, `Exported ${rows.length} experts`);
  res.type("text/csv").attachment("experts.csv").send(toCsv(rows, ["name", "email", "headline", "expertType", "domain", "skills", "yearsExperience", "location", "visibility", "status"]));
});

expertsAdmin.post("/", async (req, res) => {
  const data = parse(expertSelfInput.extend({ user: z.string().refine(isId, "Select a member"), status: z.enum(["pending", "approved", "inactive"]) }), req.body);
  if (await Expert.exists({ user: data.user })) throw new HttpError(409, "This member already has an expert profile");
  const expert = await Expert.create(data);
  await audit(req, "expert.create", "Expert", expert._id, `Created expert profile "${expert.headline}"`);
  res.status(201).json(expert);
});

expertsAdmin.put("/:id", async (req, res) => {
  const data = parse(expertSelfInput.extend({ status: z.enum(["pending", "approved", "inactive"]) }), req.body);
  const expert = await Expert.findById(oid(String(req.params.id)));
  if (!expert) throw notFound("Expert");
  const before = expert.status;
  expert.set(data);
  await expert.save();
  if (before !== "approved" && expert.status === "approved") {
    await notify([expert.user], { kind: "expert_profile", title: "Your expert profile is approved and listed in the Experts Network", link: `/experts/${expert._id}` }, req.user!._id);
  }
  await audit(req, "expert.update", "Expert", expert._id, `Updated expert "${expert.headline}" (${before} → ${expert.status})`);
  res.json(expert);
});

expertsAdmin.delete("/:id", async (req, res) => {
  const expert = await Expert.findByIdAndDelete(oid(String(req.params.id)));
  if (!expert) throw notFound("Expert");
  await audit(req, "expert.delete", "Expert", expert._id, `Deleted expert profile "${expert.headline}"`);
  res.json({ ok: true });
});

adminDirectoryRouter.use("/organizations", orgsAdmin);
adminDirectoryRouter.use("/experts", expertsAdmin);
