import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { audit } from "../lib/audit.js";
import { safeUrl } from "../lib/blocks.js";
import { HttpError, isId, notFound, oid, paged, pagination, parse, searchRegex, slugify, str, toCsv, type Filter } from "../lib/http.js";
import { ALL_PERMISSIONS, MEMBER_CATEGORIES, PERMISSIONS, PERMISSION_LABELS } from "../lib/permissions.js";
import { can, requirePermission } from "../middleware/auth.js";
import { AuditLog, CONTACT_STATUSES, ContactRequest, SiteSettings } from "../models/admin.js";
import { CONTENT_TYPES, Category, Content, Tag } from "../models/content.js";
import { FeedbackForm, FeedbackSubmission } from "../models/feedback.js";
import { Organization, Role, USER_STATUSES, User } from "../models/identity.js";
import { Enrollment, EventRegistration, Expert } from "../models/learning.js";
import { CATEGORY_ROLE } from "./auth.js";

/** Developer accounts are outside member management: never listed, counted or editable here. */
const NOT_DEVELOPER: Filter = { isDeveloper: { $ne: true } };
import { notify } from "../lib/notify.js";
import { disconnectUser, signalCounts } from "../lib/realtime.js";
import { featureOff, isFeatureOn, requireFeature } from "../lib/features.js";

export const adminRouter = Router();
adminRouter.use(requirePermission(PERMISSIONS.adminAccess));

// ---------------------------------------------------------------- overview statistics

/** Percentage change versus the previous period; null when there is no baseline to compare. */
function delta(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

adminRouter.get("/stats", async (req, res) => {
  const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const now = Date.now();
  const since = new Date(now - days * 864e5);
  const prevSince = new Date(now - 2 * days * 864e5);
  const window = (field = "createdAt") => ({
    cur: { [field]: { $gte: since } },
    prev: { [field]: { $gte: prevSince, $lt: since } },
  });
  async function metric(model: { countDocuments: (f: Filter) => Promise<number> }, base: Filter = {}, field = "createdAt") {
    const w = window(field);
    const [total, cur, prev] = await Promise.all([
      model.countDocuments(base),
      model.countDocuments({ ...base, ...w.cur }),
      model.countDocuments({ ...base, ...w.prev }),
    ]);
    return { total, recent: cur, change: delta(cur, prev) };
  }

  const badges = await Promise.all([
    User.countDocuments({ status: "pending", ...NOT_DEVELOPER }),
    Content.countDocuments({ status: "pending_review" }),
    ContactRequest.countDocuments({ status: "new" }),
  ]);
  // With overview analytics switched off only the sidebar badge counts are returned.
  if (!(await isFeatureOn("admin.analytics", req.user))) {
    res.json({ days, analytics: false, pendingApprovals: badges[0], pendingContent: badges[1], newRequests: badges[2] });
    return;
  }
  const [members, organizations, experts, opportunities, collaborations, trainingRequests, pendingApprovals, pendingContent, newRequests] = await Promise.all([
    metric(User, { status: "active", ...NOT_DEVELOPER }),
    metric(Organization, { status: "approved" }),
    metric(Expert, { status: "approved" }),
    metric(Content, { type: "opportunity", status: { $in: ["published", "scheduled"] } }),
    metric(ContactRequest, { type: { $in: ["collaboration", "partnership", "expert_connect"] } }),
    metric(ContactRequest, { type: "training" }),
    User.countDocuments({ status: "pending" }),
    Content.countDocuments({ status: "pending_review" }),
    ContactRequest.countDocuments({ status: "new" }),
  ]);

  const w = window();
  const engagementCount = async (f: Filter, sf: Filter) =>
    (await Promise.all([
      FeedbackSubmission.countDocuments(sf),
      Enrollment.countDocuments(f),
      EventRegistration.countDocuments(f),
      ContactRequest.countDocuments(f),
    ])).reduce((a, b) => a + b, 0);
  const engagementCur = await engagementCount(w.cur, { submittedAt: { $gte: since } });
  const engagementPrev = await engagementCount(w.prev, { submittedAt: { $gte: prevSince, $lt: since } });

  // Month buckets are computed in UTC to match $dateToString.
  const today = new Date();
  const monthsBack = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
  const [growth, before, byCategory, oppTrend] = await Promise.all([
    User.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: monthsBack }, status: { $in: ["active", "pending"] }, ...NOT_DEVELOPER } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    User.countDocuments({ createdAt: { $lt: monthsBack }, status: { $in: ["active", "pending"] }, ...NOT_DEVELOPER }),
    User.aggregate<{ _id: string; n: number }>([{ $match: { status: "active", ...NOT_DEVELOPER } }, { $group: { _id: "$category", n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    Content.aggregate<{ _id: string; n: number }>([
      { $match: { type: "opportunity", createdAt: { $gte: monthsBack } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  const months: string[] = [];
  for (let d = new Date(monthsBack); months.length < 12; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.toISOString().slice(0, 7));
  const growthMap = new Map(growth.map((g) => [g._id, g.n]));
  const oppMap = new Map(oppTrend.map((g) => [g._id, g.n]));
  let running = before;

  // Engagement by kind per month, and how requests received in the period are moving through the inbox.
  const byMonth = (model: { aggregate: <T>(p: object[]) => Promise<T[]> }, field = "createdAt") =>
    model.aggregate<{ _id: string; n: number }>([
      { $match: { [field]: { $gte: monthsBack } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: `$${field}` } }, n: { $sum: 1 } } },
    ]);
  const [fbMonths, enrolMonths, regMonths, reqMonths, pipeline, responseTimes] = await Promise.all([
    byMonth(FeedbackSubmission as never, "submittedAt"),
    byMonth(Enrollment as never),
    byMonth(EventRegistration as never),
    byMonth(ContactRequest as never),
    ContactRequest.aggregate<{ _id: { type: string; status: string }; n: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { type: "$type", status: "$status" }, n: { $sum: 1 } } },
    ]),
    ContactRequest.aggregate<{ hours: number }>([
      { $match: { createdAt: { $gte: since }, firstResponseAt: { $exists: true } } },
      { $project: { hours: { $divide: [{ $subtract: ["$firstResponseAt", "$createdAt"] }, 36e5] } } },
      { $sort: { hours: 1 } },
    ]),
  ]);
  const monthMap = (rows: { _id: string; n: number }[]) => new Map(rows.map((r) => [r._id, r.n]));
  const fbM = monthMap(fbMonths), enM = monthMap(enrolMonths), rgM = monthMap(regMonths), rqM = monthMap(reqMonths);
  const types = [...new Set(pipeline.map((p) => p._id.type))];
  const statusCounts = (type: string) => Object.fromEntries(CONTACT_STATUSES.map((s) => [s, pipeline.find((p) => p._id.type === type && p._id.status === s)?.n ?? 0])) as Record<(typeof CONTACT_STATUSES)[number], number>;
  const total = (c: Record<(typeof CONTACT_STATUSES)[number], number>) => CONTACT_STATUSES.reduce((a, st) => a + c[st], 0);
  const hours = responseTimes.map((r) => r.hours);

  res.json({
    days,
    analytics: true,
    engagementTrend: months.map((m) => ({ month: m, feedback: fbM.get(m) ?? 0, enrollments: enM.get(m) ?? 0, registrations: rgM.get(m) ?? 0, requests: rqM.get(m) ?? 0 })),
    requestPipeline: types.map((type) => ({ type, ...statusCounts(type) })).sort((a, b) => total(b) - total(a)),
    firstResponse: {
      count: hours.length,
      medianHours: hours.length ? hours[Math.floor((hours.length - 1) / 2)] : null,
      averageHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
    },
    members,
    organizations,
    experts,
    opportunities,
    collaborations,
    trainingRequests,
    pendingApprovals,
    pendingContent,
    newRequests,
    engagement: { recent: engagementCur, change: delta(engagementCur, engagementPrev) },
    membershipGrowth: months.map((m) => ({ month: m, total: (running += growthMap.get(m) ?? 0), joined: growthMap.get(m) ?? 0 })),
    membersByCategory: byCategory.map((c) => ({ category: c._id, count: c.n })),
    opportunityTrend: months.map((m) => ({ month: m, count: oppMap.get(m) ?? 0 })),
  });
});

/** Names used by pickers (audiences, linked forms). Contains no sensitive fields. */
adminRouter.get("/lookups", async (_req, res) => {
  const [roles, organizations, forms] = await Promise.all([
    Role.find().select("name displayName").sort({ displayName: 1 }).lean(),
    Organization.find({ status: { $ne: "inactive" } }).select("name").sort({ name: 1 }).lean(),
    FeedbackForm.find({ status: { $ne: "closed" } }).select("title status anonymity").sort({ title: 1 }).lean(),
  ]);
  res.json({ roles, organizations, forms });
});

// ---------------------------------------------------------------- members

const usersAdmin = Router();
usersAdmin.use(requirePermission(PERMISSIONS.membersManage), signalCounts);

function userFilter(query: Record<string, unknown>) {
  const f: Filter = { ...NOT_DEVELOPER };
  const status = str(query.status);
  if (status) f.status = status;
  const category = str(query.category);
  if (category) f.category = category;
  const role = str(query.role);
  if (role && isId(role)) f.roles = oid(role);
  const org = str(query.organization);
  if (org && isId(org)) f.organization = oid(org);
  const q = str(query.q);
  if (q) f.$or = [{ name: searchRegex(q) }, { email: searchRegex(q) }, { "profile.institution": searchRegex(q) }];
  return f;
}

/** The member list serves both the Members and the Member approvals screens. */
async function membersOrApprovals(req: Request, _res: Response, next: NextFunction) {
  if ((await isFeatureOn("admin.members", req.user)) || (await isFeatureOn("admin.approvals", req.user))) return next();
  throw featureOff();
}

usersAdmin.get("/", membersOrApprovals, async (req, res) => {
  const { page, limit, skip } = pagination(req, 20);
  const f = userFilter(req.query);
  const sortKey = ["name", "createdAt", "lastLoginAt"].includes(String(req.query.sort)) ? String(req.query.sort) : "createdAt";
  const [items, total] = await Promise.all([
    User.find(f).populate("roles", "name displayName").populate("organization", "name").sort({ [sortKey]: sortKey === "name" ? 1 : -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(f),
  ]);
  res.json(paged(items, total, page, limit));
});

usersAdmin.get("/export.csv", requireFeature("admin.members", "admin.exports"), async (req, res) => {
  const items = await User.find(userFilter(req.query)).populate<{ organization: { name: string } }>("organization", "name").populate<{ roles: { name: string }[] }>("roles", "name").lean();
  const rows = items.map((u) => ({
    name: u.name,
    email: u.email,
    category: u.category,
    organization: u.organization?.name,
    institution: u.profile?.institution,
    graduationYear: u.profile?.graduationYear,
    roles: u.roles.map((r) => r.name).join("; "),
    status: u.status,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt,
  }));
  await audit(req, "export", "User", null, `Exported ${rows.length} members`);
  res.type("text/csv").attachment("members.csv").send(toCsv(rows, ["name", "email", "category", "organization", "institution", "graduationYear", "roles", "status", "emailVerified", "createdAt"]));
});

usersAdmin.get("/:id", membersOrApprovals, async (req, res) => {
  const user = await User.findOne({ _id: oid(String(req.params.id)), ...NOT_DEVELOPER }).populate("roles", "name displayName").populate("organization", "name slug").lean();
  if (!user) throw notFound("Member");
  const [expert, enrollments, requests] = await Promise.all([
    Expert.findOne({ user: user._id }).lean(),
    Enrollment.countDocuments({ user: user._id }),
    ContactRequest.countDocuments({ user: user._id }),
  ]);
  res.json({ ...user, expert, stats: { enrollments, requests } });
});

/** Guard against an administrator locking everyone (including themselves) out. */
async function assertKeepsSuperAdmin(userId: string, nextRoles: string[] | null, nextStatus: string | null) {
  const superRole = await Role.findOne({ name: "super_admin" }).lean();
  if (!superRole) return;
  const target = await User.findById(userId).lean();
  if (!target || !target.roles.some((r) => String(r) === String(superRole._id))) return;
  const losesRole = nextRoles !== null && !nextRoles.includes(String(superRole._id));
  const losesStatus = nextStatus !== null && nextStatus !== "active";
  if (!losesRole && !losesStatus) return;
  const others = await User.countDocuments({ _id: { $ne: target._id }, roles: superRole._id, status: "active" });
  if (!others) throw new HttpError(409, "At least one active super administrator must remain");
}

const userUpdate = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  category: z.enum(MEMBER_CATEGORIES).optional(),
  roles: z.array(z.string().refine(isId)).max(20).optional(),
  status: z.enum(USER_STATUSES).optional(),
  organization: z.string().refine(isId).nullable().optional(),
  emailVerified: z.boolean().optional(),
});

usersAdmin.patch("/:id", requireFeature("admin.members"), async (req, res) => {
  const data = parse(userUpdate, req.body);
  const id = String(req.params.id);
  const user = await User.findOne({ _id: oid(id), ...NOT_DEVELOPER });
  if (!user) throw notFound("Member");
  if (data.roles && !can(req.user, PERMISSIONS.rolesManage)) {
    // Members managers may assign audience roles, but not roles granting admin rights.
    const privileged = await Role.find({ _id: { $in: data.roles }, permissions: PERMISSIONS.adminAccess }).lean();
    const current = new Set(user.roles.map(String));
    if (privileged.some((r) => !current.has(String(r._id)))) throw new HttpError(403, "Assigning administrative roles requires role-management permission");
  }
  await assertKeepsSuperAdmin(id, data.roles ?? null, data.status ?? null);
  const before = { status: user.status, roles: user.roles.map(String), category: user.category };
  if (data.name) user.name = data.name;
  if (data.category) user.category = data.category;
  if (data.roles) user.set("roles", data.roles);
  if (data.organization !== undefined) user.set("organization", data.organization);
  if (data.emailVerified !== undefined) user.emailVerified = data.emailVerified;
  if (data.status && data.status !== user.status) {
    user.status = data.status;
    if (data.status !== "active") user.tokenVersion += 1; // end any live sessions
  }
  await user.save();
  if (user.status !== "active") disconnectUser(String(user._id));
  await audit(req, "member.update", "User", user._id, `Updated member ${user.email}`, {
    before,
    after: { status: user.status, roles: user.roles.map(String), category: user.category },
  });
  res.json(user);
});

usersAdmin.post("/:id/approve", requireFeature("admin.approvals"), async (req, res) => {
  const { roles } = parse(z.object({ roles: z.array(z.string().refine(isId)).optional() }), req.body ?? {});
  const user = await User.findOne({ _id: oid(String(req.params.id)), ...NOT_DEVELOPER });
  if (!user) throw notFound("Member");
  if (user.status !== "pending") throw new HttpError(400, "Only pending registrations can be approved");
  let roleIds = roles;
  if (!roleIds?.length) {
    const defaults = await Role.find({ name: { $in: ["member", CATEGORY_ROLE[user.category] ?? "member"] } }).lean();
    roleIds = defaults.map((r) => String(r._id));
  }
  const privileged = await Role.exists({ _id: { $in: roleIds }, permissions: PERMISSIONS.adminAccess });
  if (privileged && !can(req.user, PERMISSIONS.rolesManage)) throw new HttpError(403, "Assigning administrative roles requires role-management permission");
  user.set("roles", roleIds);
  user.status = "active";
  user.approvedBy = req.user!._id;
  user.approvedAt = new Date();
  await user.save();
  if (user.organization) await Organization.updateOne({ _id: user.organization, status: "pending" }, { status: "approved" });
  await audit(req, "member.approve", "User", user._id, `Approved ${user.email}`);
  await notify([user._id], { kind: "membership", title: "Welcome to BIAN! Your membership is approved", body: "Explore opportunities, experts and the Knowledge Hub from your dashboard.", link: "/dashboard" });
  res.json(user);
});

usersAdmin.post("/:id/reject", requireFeature("admin.approvals"), async (req, res) => {
  const user = await User.findOne({ _id: oid(String(req.params.id)), ...NOT_DEVELOPER });
  if (!user) throw notFound("Member");
  if (user.status !== "pending") throw new HttpError(400, "Only pending registrations can be rejected");
  user.status = "rejected";
  await user.save();
  await audit(req, "member.reject", "User", user._id, `Rejected ${user.email}`);
  res.json(user);
});

// ---------------------------------------------------------------- roles

const rolesAdmin = Router();

rolesAdmin.get("/", requirePermission(PERMISSIONS.membersManage), requireFeature("admin.roles"), async (_req, res) => {
  const roles = await Role.find().sort({ isSystem: -1, displayName: 1 }).lean();
  const counts = await User.aggregate<{ _id: unknown; n: number }>([{ $unwind: "$roles" }, { $group: { _id: "$roles", n: { $sum: 1 } } }]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({
    roles: roles.map((r) => ({ ...r, members: byId.get(String(r._id)) ?? 0 })),
    permissions: ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSION_LABELS[key] })),
  });
});

const roleInput = z.object({
  name: z.string().trim().toLowerCase().regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores").max(40),
  displayName: z.string().trim().min(2).max(80),
  description: z.string().max(500).optional(),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).default([]),
});

rolesAdmin.post("/", requirePermission(PERMISSIONS.rolesManage), requireFeature("admin.roles"), async (req, res) => {
  const data = parse(roleInput, req.body);
  if (await Role.exists({ name: data.name })) throw new HttpError(409, "A role with this name exists", { name: "Already in use" });
  const role = await Role.create(data as Filter);
  await audit(req, "role.create", "Role", role._id, `Created role ${role.name}`, { permissions: role.permissions });
  res.status(201).json(role);
});

rolesAdmin.put("/:id", requirePermission(PERMISSIONS.rolesManage), requireFeature("admin.roles"), async (req, res) => {
  const data = parse(roleInput, req.body);
  const role = await Role.findById(oid(String(req.params.id)));
  if (!role) throw notFound("Role");
  if (role.name === "super_admin") throw new HttpError(400, "The super administrator role cannot be modified");
  if (role.isSystem && data.name !== role.name) throw new HttpError(400, "System role names cannot change");
  const before = [...role.permissions];
  role.set(data as Filter);
  await role.save();
  await audit(req, "role.update", "Role", role._id, `Updated role ${role.name}`, { before, after: role.permissions });
  res.json(role);
});

rolesAdmin.delete("/:id", requirePermission(PERMISSIONS.rolesManage), requireFeature("admin.roles"), async (req, res) => {
  const role = await Role.findById(oid(String(req.params.id)));
  if (!role) throw notFound("Role");
  if (role.isSystem) throw new HttpError(400, "System roles cannot be deleted");
  if (await User.exists({ roles: role._id })) throw new HttpError(409, "Remove this role from all members before deleting it");
  await role.deleteOne();
  await audit(req, "role.delete", "Role", role._id, `Deleted role ${role.name}`);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- categories & tags

const taxonomyAdmin = Router();
taxonomyAdmin.use(requirePermission(PERMISSIONS.contentManage), requireFeature("admin.taxonomy"));

taxonomyAdmin.get("/", async (_req, res) => {
  const [categories, tags] = await Promise.all([Category.find().sort({ name: 1 }).lean(), Tag.find().sort({ name: 1 }).lean()]);
  res.json({ categories, tags });
});

const categoryInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().max(500).optional(),
  contentTypes: z.array(z.enum([...CONTENT_TYPES, "course", "event"])).default([]),
  status: z.enum(["active", "inactive"]).default("active"),
});
const tagInput = z.object({ name: z.string().trim().min(1).max(60), description: z.string().max(300).optional() });

for (const [path, model, schema] of [
  ["categories", Category, categoryInput],
  ["tags", Tag, tagInput],
] as const) {
  taxonomyAdmin.post(`/${path}`, async (req, res) => {
    const data = parse(schema as z.ZodType<{ name: string }>, req.body);
    const slug = slugify(data.name);
    if (await (model as typeof Tag).exists({ slug })) throw new HttpError(409, "This name is already in use", { name: "Already exists" });
    const doc = await (model as typeof Tag).create({ ...data, slug });
    await audit(req, `${path}.create`, path, doc._id, `Created ${data.name}`);
    res.status(201).json(doc);
  });
  taxonomyAdmin.put(`/${path}/:id`, async (req, res) => {
    const data = parse(schema as z.ZodType<{ name: string }>, req.body);
    const doc = await (model as typeof Tag).findByIdAndUpdate(oid(String(req.params.id)), { ...data, slug: slugify(data.name) }, { returnDocument: "after" });
    if (!doc) throw notFound();
    res.json(doc);
  });
  taxonomyAdmin.delete(`/${path}/:id`, async (req, res) => {
    const id = oid(String(req.params.id));
    const field = path === "categories" ? "categories" : "tags";
    if (await Content.exists({ [field]: id })) throw new HttpError(409, "This is used by content items. Remove it from them first.");
    const doc = await (model as typeof Tag).findByIdAndDelete(id);
    if (!doc) throw notFound();
    await audit(req, `${path}.delete`, path, doc._id, `Deleted ${doc.name}`);
    res.json({ ok: true });
  });
}

// ---------------------------------------------------------------- audit & settings

adminRouter.get("/audit", requirePermission(PERMISSIONS.auditView), requireFeature("admin.audit"), async (req, res) => {
  const { page, limit, skip } = pagination(req, 30);
  const f: Filter = {};
  const entity = str(req.query.entityType);
  if (entity) f.entityType = entity;
  const action = str(req.query.action);
  if (action) f.action = searchRegex(action);
  const q = str(req.query.q);
  if (q) f.$or = [{ summary: searchRegex(q) }, { actorEmail: searchRegex(q) }];
  // Developer activity (feature switches, console changes) stays in the developer console.
  const hidden: Filter = {};
  if (!req.user!.isDeveloper) {
    const developers = await User.find({ isDeveloper: true }).select("_id").lean();
    hidden.actor = { $nin: developers.map((d) => d._id) };
    hidden.entityType = { $ne: "FeatureSetting" };
  }
  const scoped: Filter = { $and: [f, hidden] };
  const [items, total, entityTypes] = await Promise.all([
    AuditLog.find(scoped).sort({ at: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(scoped),
    AuditLog.distinct("entityType", hidden),
  ]);
  res.json({ ...paged(items, total, page, limit), entityTypes });
});

const settingsInput = z.object({
  hero: z.object({
    headline: z.array(z.string().max(80)).max(4),
    highlight: z.string().max(80),
    subheading: z.string().max(300),
    keywords: z.array(z.string().max(30)).max(6),
    videoUrl: z.string().max(500).optional(),
  }),
  contact: z.object({
    email: z.string().max(200),
    phone: z.string().max(40),
    address: z.string().max(300),
    ownerLine: z.string().max(200).optional(),
    quote: z.string().max(300).optional(),
  }),
  social: z.object({ linkedin: z.string().max(300).optional(), twitter: z.string().max(300).optional(), youtube: z.string().max(300).optional() }).optional(),
});

adminRouter.put("/settings", requirePermission(PERMISSIONS.settingsManage), requireFeature("admin.settings"), async (req, res) => {
  const data = parse(settingsInput, req.body);
  data.hero.videoUrl = safeUrl(data.hero.videoUrl);
  if (data.social) for (const k of ["linkedin", "twitter", "youtube"] as const) data.social[k] = safeUrl(data.social[k]);
  const doc = await SiteSettings.findOneAndUpdate({ key: "site" }, data, { upsert: true, returnDocument: "after" });
  await audit(req, "settings.update", "SiteSettings", doc._id, "Updated site settings");
  res.json(doc);
});

adminRouter.use("/users", usersAdmin);
adminRouter.use("/roles", rolesAdmin);
adminRouter.use("/taxonomy", taxonomyAdmin);
