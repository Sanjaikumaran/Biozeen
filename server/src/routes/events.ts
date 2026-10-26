import { Router } from "express";
import { z } from "zod";
import { canView, isContentManager, isLive, visibleFilter } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { cleanBlocks, mediaIdsInBlocks, safeUrl } from "../lib/blocks.js";
import { HttpError, isId, notFound, oid, paged, pagination, parse, searchRegex, slugify, str, type Filter } from "../lib/http.js";
import { PERMISSIONS } from "../lib/permissions.js";
import { accessInput, applyStatus, dateInput, dropDisabledFields, mediaIdFromUrl, syncMediaLinks } from "../lib/publishing.js";
import { publicForm, resolveBlocks } from "../lib/resolve.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { PUBLICATION_STATUSES } from "../models/common.js";
import { FeedbackForm } from "../models/feedback.js";
import { EVENT_TYPES, Event, EventRegistration } from "../models/learning.js";
import { afterStatusChange } from "../lib/notify.js";
import { isFeatureOn, requireFeature } from "../lib/features.js";

export const eventsRouter = Router();
export const adminEventsRouter = Router();

const LIST_FIELDS = "-blocks -location.meetingUrl";

eventsRouter.get("/", requireFeature("events.calendar"), async (req, res) => {
  const { page, limit, skip } = pagination(req, 10);
  const f: Filter = {};
  const type = str(req.query.type);
  if (type && (EVENT_TYPES as readonly string[]).includes(type)) f.eventType = type;
  const q = str(req.query.q);
  if (q) f.$or = [{ title: searchRegex(q) }, { summary: searchRegex(q) }];
  const when = str(req.query.when) ?? "upcoming";
  const now = new Date();
  if (when === "upcoming") f.$and = [{ $or: [{ endAt: { $gte: now } }, { endAt: null, startAt: { $gte: now } }] }];
  if (when === "past") f.startAt = { $lt: now };
  const filter = { $and: [f, visibleFilter(req.user)] };
  const [items, total] = await Promise.all([
    Event.find(filter).select(LIST_FIELDS).sort({ startAt: when === "past" ? -1 : 1 }).skip(skip).limit(limit).lean(),
    Event.countDocuments(filter),
  ]);
  res.json(paged(items, total, page, limit));
});

eventsRouter.get("/:slug", requireFeature("events.calendar"), async (req, res) => {
  const event = await Event.findOne({ slug: req.params.slug }).populate("categories", "name slug").lean();
  if (!event) throw notFound("Event");
  if (!canView(event, req.user)) {
    if (!isLive(event)) throw notFound("Event");
    if (!req.user) throw new HttpError(401, "This event is available to signed-in members", { restricted: true });
    throw new HttpError(403, "This event is restricted to selected member roles", { restricted: true });
  }
  const [registration, registeredCount, form] = await Promise.all([
    req.user ? EventRegistration.findOne({ event: event._id, user: req.user._id, status: "registered" }).lean() : null,
    EventRegistration.countDocuments({ event: event._id, status: "registered" }),
    event.feedbackForm && (await isFeatureOn("feedback", req.user)) ? FeedbackForm.findOne({ _id: event.feedbackForm, status: "active" }).lean() : null,
  ]);
  // The meeting link is shared with registered attendees (or everyone if registration is off).
  const showMeeting = isContentManager(req.user) || !!registration || (!event.registration?.enabled && !!req.user);
  res.json({
    ...event,
    location: { ...event.location, meetingUrl: showMeeting ? event.location?.meetingUrl : undefined },
    blocks: await resolveBlocks(event.blocks, req.user),
    registered: !!registration,
    registeredCount,
    feedbackForm: form ? publicForm(form) : null,
    preview: !isLive(event),
  });
});

eventsRouter.post("/:id/register", requireAuth, requireFeature("events.registration"), async (req, res) => {
  const event = await Event.findById(oid(String(req.params.id))).lean();
  if (!event || !canView(event, req.user)) throw notFound("Event");
  if (!event.registration?.enabled) throw new HttpError(400, "Registration is not open for this event");
  if (event.registration.deadline && event.registration.deadline < new Date()) throw new HttpError(400, "Registration has closed");
  if (event.startAt < new Date()) throw new HttpError(400, "This event has already started");
  const existing = await EventRegistration.findOne({ event: event._id, user: req.user!._id });
  if (existing?.status === "registered") return res.json({ registered: true });
  if (event.registration.capacity) {
    const count = await EventRegistration.countDocuments({ event: event._id, status: "registered" });
    if (count >= event.registration.capacity) throw new HttpError(409, "This event is fully booked");
  }
  if (existing) {
    existing.status = "registered";
    await existing.save();
  } else await EventRegistration.create({ event: event._id, user: req.user!._id });
  res.status(201).json({ registered: true });
});

eventsRouter.delete("/:id/register", requireAuth, async (req, res) => {
  await EventRegistration.updateOne({ event: oid(String(req.params.id)), user: req.user!._id }, { status: "cancelled" });
  res.json({ registered: false });
});

// ---------------------------------------------------------------- admin

const eventInput = z.object({
  title: z.string().trim().min(2, "Title is required").max(200),
  slug: z.string().trim().max(80).optional(),
  summary: z.string().max(600).optional(),
  eventType: z.enum(EVENT_TYPES),
  startAt: z.string().min(1, "Start date is required").transform((v) => new Date(v)).refine((d) => !Number.isNaN(d.getTime()), "Invalid date"),
  endAt: dateInput,
  location: z
    .object({
      mode: z.enum(["in_person", "online", "hybrid"]),
      venue: z.string().max(200).optional(),
      city: z.string().max(120).optional(),
      meetingUrl: z.string().max(500).optional(),
    })
    .optional(),
  registration: z
    .object({
      enabled: z.boolean(),
      capacity: z.number().int().min(0).nullable().optional(),
      deadline: dateInput,
      externalUrl: z.string().max(500).optional(),
    })
    .optional(),
  featuredImage: z.string().max(500).optional(),
  blocks: z.array(z.unknown()).optional(),
  categories: z.array(z.string().refine(isId)).optional(),
  status: z.enum(PUBLICATION_STATUSES).optional(),
  publishAt: dateInput,
  expireAt: dateInput,
  access: accessInput.optional(),
  feedbackForm: z.string().refine(isId).nullable().optional(),
});

adminEventsRouter.use(requirePermission(PERMISSIONS.adminAccess, PERMISSIONS.contentManage), requireFeature("admin.events"));

adminEventsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = pagination(req, 20);
  const f: Filter = {};
  const q = str(req.query.q);
  if (q) f.title = searchRegex(q);
  const status = str(req.query.status);
  if (status) f.status = status;
  const [items, total] = await Promise.all([
    Event.find(f).select("-blocks").sort({ startAt: -1 }).skip(skip).limit(limit).lean(),
    Event.countDocuments(f),
  ]);
  const counts = await EventRegistration.aggregate<{ _id: unknown; n: number }>([
    { $match: { event: { $in: items.map((i) => i._id) }, status: "registered" } },
    { $group: { _id: "$event", n: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json(paged(items.map((i) => ({ ...i, registrations: byId.get(String(i._id)) ?? 0 })), total, page, limit));
});

adminEventsRouter.get("/:id", async (req, res) => {
  const event = await Event.findById(oid(String(req.params.id))).lean();
  if (!event) throw notFound("Event");
  res.json(event);
});

adminEventsRouter.get("/:id/registrations", requirePermission(PERMISSIONS.membersManage), requireFeature("admin.registrations"), async (req, res) => {
  const regs = await EventRegistration.find({ event: oid(String(req.params.id)) })
    .populate("user", "name email category")
    .sort({ createdAt: -1 })
    .lean();
  res.json(regs);
});

function applyEvent(doc: InstanceType<typeof Event>, data: z.infer<typeof eventInput>) {
  doc.title = data.title;
  doc.eventType = data.eventType;
  doc.startAt = data.startAt;
  for (const key of ["summary", "endAt", "publishAt", "expireAt"] as const) if (data[key] !== undefined) doc.set(key, data[key]);
  if (data.location) doc.set("location", { ...data.location, meetingUrl: safeUrl(data.location.meetingUrl) });
  if (data.registration) doc.set("registration", { ...data.registration, externalUrl: safeUrl(data.registration.externalUrl) });
  if (data.featuredImage !== undefined) doc.featuredImage = safeUrl(data.featuredImage);
  if (data.blocks) doc.set("blocks", cleanBlocks(data.blocks));
  if (data.categories) doc.set("categories", data.categories);
  if (data.access) doc.set("access", data.access);
  if (data.feedbackForm !== undefined) doc.set("feedbackForm", data.feedbackForm);
  if (doc.endAt && doc.endAt < doc.startAt) throw new HttpError(400, "End must be after start", { endAt: "End must be after start" });
}

async function uniqueEventSlug(wanted: string, excludeId?: unknown) {
  const base = slugify(wanted) || "event";
  let slug = base;
  for (let i = 2; await Event.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }); i++) slug = `${base}-${i}`;
  return slug;
}

async function afterEventSave(doc: InstanceType<typeof Event>) {
  const ids = mediaIdsInBlocks(doc.blocks);
  const img = mediaIdFromUrl(doc.featuredImage);
  if (img) ids.push(img);
  await syncMediaLinks("event", doc._id, ids);
}

adminEventsRouter.post("/", async (req, res) => {
  const data = await dropDisabledFields(parse(eventInput, req.body), req.user!);
  const doc = new Event({ author: req.user!._id, slug: await uniqueEventSlug(data.slug || data.title) });
  applyEvent(doc, data);
  await applyStatus(doc, data.status, req.user!);
  await doc.save();
  await afterEventSave(doc);
  await afterStatusChange(doc, "draft", req.user!._id, true);
  await audit(req, "event.create", "Event", doc._id, `Created event "${doc.title}"`);
  res.status(201).json(doc);
});

adminEventsRouter.put("/:id", async (req, res) => {
  const doc = await Event.findById(oid(String(req.params.id)));
  if (!doc) throw notFound("Event");
  const data = await dropDisabledFields(parse(eventInput, req.body), req.user!);
  if (data.slug && data.slug !== doc.slug) doc.slug = await uniqueEventSlug(data.slug, doc._id);
  const fromStatus = doc.status;
  applyEvent(doc, data);
  await applyStatus(doc, data.status, req.user!);
  await doc.save();
  await afterEventSave(doc);
  await afterStatusChange(doc, fromStatus, req.user!._id, true);
  await audit(req, "event.update", "Event", doc._id, `Updated event "${doc.title}" (${doc.status})`);
  res.json(doc);
});

adminEventsRouter.delete("/:id", requirePermission(PERMISSIONS.contentPublish), async (req, res) => {
  const doc = await Event.findByIdAndDelete(oid(String(req.params.id)));
  if (!doc) throw notFound("Event");
  await EventRegistration.deleteMany({ event: doc._id });
  await syncMediaLinks("event", doc._id, []);
  await audit(req, "event.delete", "Event", doc._id, `Deleted event "${doc.title}"`);
  res.json({ ok: true });
});
