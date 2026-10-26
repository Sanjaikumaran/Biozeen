import { Router } from "express";
import { z } from "zod";
import { canView, isLive, visibleFilter } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { cleanBlocks, mediaIdsInBlocks, safeUrl } from "../lib/blocks.js";
import { HttpError, isId, notFound, oid, paged, pagination, parse, searchRegex, slugify, str, type Filter } from "../lib/http.js";
import { PERMISSIONS } from "../lib/permissions.js";
import { accessInput, applyStatus, dateInput, dropDisabledFields, mediaIdFromUrl, syncMediaLinks } from "../lib/publishing.js";
import { CARD_FIELDS, publicForm, resolveBlocks } from "../lib/resolve.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { PUBLICATION_STATUSES } from "../models/common.js";
import { CONTENT_TYPES, Category, Content, KNOWLEDGE_SECTIONS, OPPORTUNITY_TYPES, Tag } from "../models/content.js";
import { FeedbackForm } from "../models/feedback.js";
import { User } from "../models/identity.js";
import { notifyPermission, afterStatusChange } from "../lib/notify.js";
import { allowedContentTypes, contentFeature, featureOff, isFeatureOn, requireFeature } from "../lib/features.js";
import { signalCounts } from "../lib/realtime.js";

export const contentsRouter = Router();
export const adminContentsRouter = Router();

const KNOWLEDGE_TYPES = ["article", "blog", "tutorial"];
const PORTFOLIO_TYPES = ["page", "project", "case_study", "service"];

function listFilter(query: Record<string, unknown>) {
  const f: Filter = {};
  const type = str(query.type);
  if (type === "knowledge") f.type = { $in: KNOWLEDGE_TYPES };
  else if (type === "portfolio") f.type = { $in: PORTFOLIO_TYPES };
  else if (type && (CONTENT_TYPES as readonly string[]).includes(type)) f.type = type;
  const q = str(query.q);
  if (q) f.$or = [{ title: searchRegex(q) }, { summary: searchRegex(q) }];
  const cat = str(query.category);
  if (cat && isId(cat)) f.categories = oid(cat);
  const tag = str(query.tag);
  if (tag && isId(tag)) f.tags = oid(tag);
  const section = str(query.section);
  if (section) f["knowledge.section"] = section;
  const oppType = str(query.opportunityType);
  if (oppType) f["opportunity.opportunityType"] = oppType;
  const location = str(query.location);
  if (location) f["opportunity.location"] = searchRegex(location);
  const portfolioSection = str(query.portfolioSection);
  if (portfolioSection) f["portfolio.section"] = portfolioSection;
  if (query.featured === "true") f.featured = true;
  return f;
}

const SORTS: Record<string, Record<string, 1 | -1>> = {
  latest: { publishedAt: -1, _id: -1 },
  oldest: { publishedAt: 1, _id: 1 },
  deadline: { "opportunity.deadline": 1, _id: 1 },
  order: { order: 1, publishedAt: -1 },
  title: { title: 1 },
};

/** Public listing — every result is filtered by publication state and audience. */
contentsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = pagination(req);
  const filter = { $and: [listFilter(req.query), visibleFilter(req.user), { type: { $in: await allowedContentTypes(req.user) } }] };
  const sort = SORTS[String(req.query.sort)] ?? SORTS.latest!;
  const [items, total] = await Promise.all([
    Content.find(filter)
      .select(CARD_FIELDS)
      .populate("categories", "name slug")
      .populate("tags", "name slug")
      .populate("author", "name")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Content.countDocuments(filter),
  ]);
  res.json(paged(items, total, page, limit));
});

contentsRouter.get("/taxonomy", async (_req, res) => {
  const [categories, tags] = await Promise.all([
    Category.find({ status: "active" }).sort({ name: 1 }).lean(),
    Tag.find().sort({ name: 1 }).lean(),
  ]);
  res.json({ categories, tags, opportunityTypes: OPPORTUNITY_TYPES, knowledgeSections: KNOWLEDGE_SECTIONS });
});

contentsRouter.get("/by-slug/:type/:slug", async (req, res) => {
  const type = req.params.type;
  const types = type === "knowledge" ? KNOWLEDGE_TYPES : type === "portfolio" ? PORTFOLIO_TYPES : [type];
  const item = await Content.findOne({ type: { $in: types }, slug: req.params.slug } as Filter)
    .populate("categories", "name slug")
    .populate("tags", "name slug")
    .populate("author", "name")
    .populate("opportunity.organization", "name slug logoUrl website")
    .lean();
  if (!item) throw notFound("Page");
  if (!(await isFeatureOn(contentFeature(item.type), req.user))) throw featureOff();
  if (!canView(item, req.user)) {
    // Unpublished items are indistinguishable from missing ones.
    if (!isLive(item)) throw notFound("Page");
    if (!req.user) throw new HttpError(401, "This content is available to signed-in members", { restricted: true });
    throw new HttpError(403, "This content is restricted to selected member roles", { restricted: true });
  }
  const blocks = await resolveBlocks(item.blocks, req.user);
  const form =
    item.feedbackForm && (await isFeatureOn("feedback", req.user)) && (await FeedbackForm.findOne({ _id: item.feedbackForm, status: "active" }).lean());
  let saved = false;
  if (req.user) saved = !!(await User.exists({ _id: req.user._id, savedContents: item._id }));
  res.json({
    ...item,
    blocks,
    feedbackForm: form ? publicForm(form) : null,
    preview: !isLive(item),
    saved,
  });
});

contentsRouter.post("/:id/save", requireAuth, requireFeature("saved"), async (req, res) => {
  const item = await Content.findById(oid(String(req.params.id))).lean();
  if (!item || !canView(item, req.user)) throw notFound("Content");
  const exists = await User.exists({ _id: req.user!._id, savedContents: item._id });
  await User.updateOne({ _id: req.user!._id }, exists ? { $pull: { savedContents: item._id } } : { $addToSet: { savedContents: item._id } });
  res.json({ saved: !exists });
});

const opportunityInput = z
  .object({
    opportunityType: z.enum(OPPORTUNITY_TYPES).optional(),
    organization: z.string().refine(isId).nullable().optional(),
    organizationName: z.string().trim().max(160).optional(),
    location: z.string().trim().max(160).optional(),
    workMode: z.enum(["onsite", "remote", "hybrid"]).optional(),
    employmentType: z.string().trim().max(60).optional(),
    deadline: dateInput,
    applyUrl: z.string().trim().max(500).optional(),
    applyEmail: z.string().trim().max(200).optional(),
    eligibility: z.string().trim().max(3000).optional(),
  })
  .partial();

/** Members with `opportunities.post` can submit an opportunity; it goes to review. */
contentsRouter.post("/submissions", signalCounts, requirePermission(PERMISSIONS.opportunitiesPost), requireFeature("opportunities.post"), async (req, res) => {
  const data = parse(
    z.object({
      title: z.string().trim().min(5, "Add a descriptive title").max(200),
      summary: z.string().trim().min(20, "Describe the opportunity in a few sentences").max(600),
      details: z.string().trim().max(10000).optional(),
      opportunity: opportunityInput.extend({ opportunityType: z.enum(OPPORTUNITY_TYPES) }),
    }),
    req.body,
  );
  const slug = `${slugify(data.title)}-${Date.now().toString(36)}`;
  const item = await Content.create({
    type: "opportunity",
    title: data.title,
    slug,
    summary: data.summary,
    blocks: cleanBlocks(data.details ? [{ type: "richText", data: { html: data.details.split(/\n{2,}/).map((p) => `<p>${p.replace(/[<>&]/g, "")}</p>`).join("") } }] : []),
    author: req.user!._id,
    status: "pending_review",
    access: { visibility: "authenticated" },
    opportunity: {
      ...data.opportunity,
      applyUrl: safeUrl(data.opportunity.applyUrl),
      organization: data.opportunity.organization ?? req.user!.organization ?? undefined,
    },
  });
  await audit(req, "content.submit", "Content", item._id, `Submitted opportunity "${item.title}" for review`);
  await notifyPermission(PERMISSIONS.contentPublish, { kind: "content_review", title: `Opportunity to review: ${item.title}`, body: `Submitted by ${req.user!.name}`, link: `/admin/content/${item._id}` }, req.user!._id);
  res.status(201).json({ _id: item._id, message: "Submitted. The BIAN team will review it before publication." });
});

// ---------------------------------------------------------------- admin CMS

const contentInput = z.object({
  type: z.enum(CONTENT_TYPES),
  title: z.string().trim().min(2, "Title is required").max(200),
  slug: z.string().trim().max(80).optional(),
  summary: z.string().trim().max(600).optional(),
  featuredImage: z.string().trim().max(500).optional(),
  blocks: z.array(z.unknown()).optional(),
  categories: z.array(z.string().refine(isId)).max(20).optional(),
  tags: z.array(z.string().refine(isId)).max(30).optional(),
  status: z.enum(PUBLICATION_STATUSES).optional(),
  publishAt: dateInput,
  expireAt: dateInput,
  featured: z.boolean().optional(),
  order: z.number().int().optional(),
  seo: z.object({ title: z.string().max(200).optional(), description: z.string().max(400).optional(), noIndex: z.boolean().optional() }).optional(),
  access: accessInput.optional(),
  feedbackForm: z.string().refine(isId).nullable().optional(),
  opportunity: opportunityInput.optional(),
  knowledge: z.object({ section: z.enum(KNOWLEDGE_SECTIONS).optional(), readingMinutes: z.number().int().min(0).max(600).optional() }).partial().optional(),
  portfolio: z.object({ section: z.string().max(60).optional(), client: z.string().max(160).optional(), year: z.number().int().optional() }).partial().optional(),
});

adminContentsRouter.use(requirePermission(PERMISSIONS.adminAccess, PERMISSIONS.contentManage), signalCounts);

/** Each content editor (portfolio, opportunities, knowledge, announcements) is its own admin feature. */
function adminContentFeature(type: string) {
  return { portfolio: "admin.portfolio", opportunities: "admin.opportunities", "knowledge.resources": "admin.knowledge", "events.announcements": "admin.announcements" }[contentFeature(type)]!;
}
async function assertEditable(type: string, user: Express.Request["user"]) {
  if (!(await isFeatureOn(adminContentFeature(type), user))) throw featureOff();
}

adminContentsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = pagination(req, 20);
  const filter = listFilter(req.query);
  const status = str(req.query.status);
  if (status) filter.status = status;
  const editable: string[] = [];
  for (const t of CONTENT_TYPES) if (await isFeatureOn(adminContentFeature(t), req.user)) editable.push(t);
  filter.$and = [{ type: { $in: editable } }];
  const [items, total] = await Promise.all([
    Content.find(filter).select(`${CARD_FIELDS} order`).populate("author", "name").sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    Content.countDocuments(filter),
  ]);
  res.json(paged(items, total, page, limit));
});

adminContentsRouter.get("/:id", async (req, res) => {
  const item = await Content.findById(oid(String(req.params.id))).populate("author", "name").lean();
  if (!item) throw notFound("Content");
  await assertEditable(item.type, req.user);
  res.json(item);
});

async function uniqueSlug(type: string, wanted: string, excludeId?: unknown) {
  const base = slugify(wanted) || "untitled";
  let slug = base;
  for (let i = 2; await Content.exists(<Filter>{ type, slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }); i++) slug = `${base}-${i}`;
  return slug;
}

function applyInput(doc: InstanceType<typeof Content>, data: z.infer<typeof contentInput>) {
  doc.title = data.title;
  if (data.summary !== undefined) doc.summary = data.summary;
  if (data.featuredImage !== undefined) doc.featuredImage = safeUrl(data.featuredImage);
  if (data.blocks !== undefined) doc.set("blocks", cleanBlocks(data.blocks));
  if (data.categories) doc.set("categories", data.categories);
  if (data.tags) doc.set("tags", data.tags);
  if (data.publishAt !== undefined) doc.publishAt = data.publishAt;
  if (data.expireAt !== undefined) doc.expireAt = data.expireAt;
  if (data.featured !== undefined) doc.featured = data.featured;
  if (data.order !== undefined) doc.order = data.order;
  if (data.seo) doc.set("seo", data.seo);
  if (data.access) doc.set("access", data.access);
  if (data.feedbackForm !== undefined) doc.set("feedbackForm", data.feedbackForm);
  if (data.opportunity) doc.set("opportunity", { ...data.opportunity, applyUrl: safeUrl(data.opportunity.applyUrl) });
  if (data.knowledge) doc.set("knowledge", data.knowledge);
  if (data.portfolio) doc.set("portfolio", data.portfolio);
}

async function afterSave(doc: InstanceType<typeof Content>) {
  const ids = mediaIdsInBlocks(doc.blocks);
  const featured = mediaIdFromUrl(doc.featuredImage);
  if (featured) ids.push(featured);
  await syncMediaLinks("content", doc._id, ids);
}

adminContentsRouter.post("/", async (req, res) => {
  const data = await dropDisabledFields(parse(contentInput, req.body), req.user!);
  await assertEditable(data.type, req.user);
  const doc = new Content({ type: data.type, author: req.user!._id, status: "draft" });
  doc.slug = await uniqueSlug(data.type, data.slug || data.title);
  applyInput(doc, data);
  await applyStatus(doc, data.status, req.user!);
  await doc.save();
  await afterSave(doc);
  await afterStatusChange(doc, "draft", req.user!._id);
  await audit(req, "content.create", "Content", doc._id, `Created ${doc.type} "${doc.title}" (${doc.status})`);
  res.status(201).json(doc);
});

adminContentsRouter.put("/:id", async (req, res) => {
  const doc = await Content.findById(oid(String(req.params.id)));
  if (!doc) throw notFound("Content");
  await assertEditable(doc.type, req.user);
  const data = await dropDisabledFields(parse(contentInput, req.body), req.user!);
  const before = { status: doc.status, visibility: doc.access?.visibility };
  if (data.slug && data.slug !== doc.slug) doc.slug = await uniqueSlug(doc.type, data.slug, doc._id);
  applyInput(doc, data);
  await applyStatus(doc, data.status, req.user!);
  await doc.save();
  await afterSave(doc);
  await afterStatusChange(doc, before.status, req.user!._id);
  await audit(req, "content.update", "Content", doc._id, `Updated ${doc.type} "${doc.title}"`, {
    before,
    after: { status: doc.status, visibility: doc.access?.visibility },
  });
  res.json(doc);
});

adminContentsRouter.post("/:id/status", async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(PUBLICATION_STATUSES) }), req.body);
  const doc = await Content.findById(oid(String(req.params.id)));
  if (!doc) throw notFound("Content");
  await assertEditable(doc.type, req.user);
  const from = doc.status;
  await applyStatus(doc, status, req.user!);
  await doc.save();
  await afterStatusChange(doc, from, req.user!._id);
  await audit(req, "content.status", "Content", doc._id, `"${doc.title}": ${from} → ${doc.status}`);
  res.json(doc);
});

adminContentsRouter.delete("/:id", requirePermission(PERMISSIONS.contentPublish), async (req, res) => {
  const existing = await Content.findById(oid(String(req.params.id))).select("type").lean();
  if (!existing) throw notFound("Content");
  await assertEditable(existing.type, req.user);
  const doc = await Content.findByIdAndDelete(existing._id);
  if (!doc) throw notFound("Content");
  await syncMediaLinks("content", doc._id, []);
  await audit(req, "content.delete", "Content", doc._id, `Deleted ${doc.type} "${doc.title}"`);
  res.json({ ok: true });
});

