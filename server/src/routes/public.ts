import { Router } from "express";
import { z } from "zod";
import { liveFilter, visibleFilter } from "../lib/access.js";
import { HttpError, parse, searchRegex, type Filter } from "../lib/http.js";
import { CARD_FIELDS } from "../lib/resolve.js";
import { requireAuth } from "../middleware/auth.js";
import { ContactRequest, SiteSettings } from "../models/admin.js";
import { Content } from "../models/content.js";
import { FeedbackSubmission } from "../models/feedback.js";
import { Organization, User } from "../models/identity.js";
import { Course, Enrollment, Event, EventRegistration, Expert } from "../models/learning.js";

export const publicRouter = Router();
export const meRouter = Router();

publicRouter.get("/settings", async (_req, res) => {
  res.json((await SiteSettings.findOne({ key: "site" }).lean()) ?? {});
});

/** Aggregate counts only — no record-level data. */
async function publicStats() {
  const approvedPublic: Filter = { status: "approved", visibility: "public" };
  const [partners, experts, institutions, opportunities, members] = await Promise.all([
    Organization.countDocuments(approvedPublic),
    Expert.countDocuments({ status: "approved" }),
    Organization.countDocuments({ ...approvedPublic, orgType: { $in: ["academia", "research"] } }),
    Content.countDocuments({ type: "opportunity", ...liveFilter() }),
    User.countDocuments({ status: "active" }),
  ]);
  return { partners, experts, institutions, opportunities, members };
}

publicRouter.get("/stats", async (_req, res) => {
  res.json(await publicStats());
});

publicRouter.get("/home", async (req, res) => {
  const visible = visibleFilter(req.user);
  const cards = (type: string | { $in: string[] }, limit: number, extra = {}) =>
    Content.find({ $and: [{ type, ...extra }, visible] }).select(CARD_FIELDS).sort({ featured: -1, publishedAt: -1 }).limit(limit).lean();
  const [stats, about, services, opportunities, knowledge, announcements, events, partners, settings] = await Promise.all([
    publicStats(),
    Content.findOne({ $and: [{ type: "page", slug: "about" }, visible] }).select("title summary featuredImage").lean(),
    cards("service", 6),
    cards("opportunity", 3),
    cards({ $in: ["article", "blog", "tutorial"] }, 4),
    cards("announcement", 3),
    Event.find({ $and: [{ startAt: { $gte: new Date() } }, visible] }).select("-blocks -location.meetingUrl").sort({ startAt: 1 }).limit(3).lean(),
    Organization.find({ status: "approved", visibility: "public", partnerTier: { $ne: "none" } }).select("name slug logoUrl partnerTier").sort({ partnerTier: 1, name: 1 }).limit(12).lean(),
    SiteSettings.findOne({ key: "site" }).lean(),
  ]);
  res.json({ stats, about, services, opportunities, knowledge, announcements, events, partners, settings });
});

/** Site-wide search; each source applies the same visibility rules as its own listing. */
publicRouter.get("/search", async (req, res) => {
  const { q } = parse(z.object({ q: z.string().trim().min(2, "Enter at least 2 characters").max(100) }), req.query);
  const rx = searchRegex(q);
  const visible = visibleFilter(req.user);
  const [contents, courses, events, experts] = await Promise.all([
    Content.find({ $and: [{ $or: [{ title: rx }, { summary: rx }] }, visible] }).select(CARD_FIELDS).limit(20).lean(),
    Course.find({ $and: [{ $or: [{ title: rx }, { summary: rx }] }, visible] }).select("title slug summary thumbnail").limit(10).lean(),
    Event.find({ $and: [{ $or: [{ title: rx }, { summary: rx }] }, visible] }).select("title slug summary startAt eventType").limit(10).lean(),
    Expert.find({ status: "approved", visibility: { $in: req.user ? ["public", "members"] : ["public"] }, $or: [{ headline: rx }, { skills: rx }, { expertiseAreas: rx }] })
      .populate("user", "name")
      .select("headline expertType user")
      .limit(10)
      .lean(),
  ]);
  res.json({ contents, courses, events, experts: experts.map((e) => ({ _id: e._id, headline: e.headline, expertType: e.expertType, name: (e.user as { name?: string } | null)?.name })) });
});

// ---------------------------------------------------------------- member self-service

meRouter.use(requireAuth);

meRouter.get("/dashboard", async (req, res) => {
  const user = req.user!;
  const visible = visibleFilter(user);
  const me = await User.findById(user._id).select("savedContents").lean();
  const [myOpportunities, pendingOpps, saved, enrollments, registrations, requests, feedbackCount, opportunities, knowledge, announcements, events, expertProfile, recentRequests] = await Promise.all([
    Content.countDocuments({ author: user._id, type: "opportunity", ...liveFilter() }),
    Content.countDocuments({ author: user._id, type: "opportunity", status: "pending_review" }),
    Content.find({ $and: [{ _id: { $in: me?.savedContents ?? [] } }, visible] }).select(CARD_FIELDS).limit(6).lean(),
    Enrollment.find({ user: user._id, status: { $ne: "withdrawn" } }).populate("course", "title slug thumbnail").sort({ updatedAt: -1 }).limit(6).lean(),
    EventRegistration.find({ user: user._id, status: "registered" }).populate("event", "title slug startAt eventType location.mode location.city").sort({ createdAt: -1 }).limit(10).lean(),
    ContactRequest.countDocuments({ user: user._id, status: { $in: ["new", "in_progress"] } }),
    FeedbackSubmission.countDocuments({ user: user._id }),
    Content.find({ $and: [{ type: "opportunity" }, visible] }).select(CARD_FIELDS).sort({ publishedAt: -1 }).limit(4).lean(),
    Content.find({ $and: [{ type: { $in: ["article", "blog", "tutorial"] } }, visible] }).select(CARD_FIELDS).sort({ publishedAt: -1 }).limit(4).lean(),
    Content.find({ $and: [{ type: "announcement" }, visible] }).select(CARD_FIELDS).sort({ publishedAt: -1 }).limit(4).lean(),
    Event.find({ $and: [{ startAt: { $gte: new Date() } }, visible] }).select("title slug startAt eventType location.mode location.city").sort({ startAt: 1 }).limit(4).lean(),
    Expert.findOne({ user: user._id }).select("status headline").lean(),
    ContactRequest.find({ user: user._id }).select("type subject status response updatedAt").sort({ updatedAt: -1 }).limit(5).lean(),
  ]);

  const upcoming = registrations.filter((r) => {
    const start = (r.event as unknown as { startAt?: Date } | null)?.startAt;
    return !!start && start >= new Date();
  });
  const notifications = [
    ...recentRequests.filter((r) => r.response).map((r) => ({ kind: "request", text: `Response received: ${r.subject ?? r.type}`, at: r.updatedAt })),
    ...(pendingOpps ? [{ kind: "opportunity", text: `${pendingOpps} opportunity submission(s) awaiting review`, at: new Date() }] : []),
    ...(expertProfile?.status === "pending" ? [{ kind: "expert", text: "Your expert profile is awaiting approval", at: new Date() }] : []),
  ];

  res.json({
    counts: { activePosts: myOpportunities, pendingPosts: pendingOpps, saved: me?.savedContents.length ?? 0, enrollments: enrollments.length, upcomingEvents: upcoming.length, openRequests: requests, feedback: feedbackCount },
    saved,
    enrollments,
    registrations: upcoming,
    opportunities,
    knowledge,
    announcements,
    events,
    expertProfile,
    recentRequests,
    notifications,
  });
});

meRouter.get("/opportunities", async (req, res) => {
  const items = await Content.find({ author: req.user!._id, type: "opportunity" }).select(CARD_FIELDS).sort({ createdAt: -1 }).lean();
  res.json(items);
});

meRouter.get("/saved", async (req, res) => {
  const me = await User.findById(req.user!._id).select("savedContents").lean();
  const items = await Content.find({ $and: [{ _id: { $in: me?.savedContents ?? [] } }, visibleFilter(req.user)] }).select(CARD_FIELDS).lean();
  res.json(items);
});

meRouter.get("/learning", async (req, res) => {
  const items = await Enrollment.find({ user: req.user!._id }).populate("course", "title slug thumbnail summary modules.lessons._id").sort({ updatedAt: -1 }).lean();
  res.json(items);
});

meRouter.get("/events", async (req, res) => {
  const items = await EventRegistration.find({ user: req.user!._id, status: "registered" }).populate("event", "title slug startAt endAt eventType location.mode location.city location.venue").sort({ createdAt: -1 }).lean();
  res.json(items);
});

/** Requests the member sent; internal notes and assignment are never included. */
meRouter.get("/requests", async (req, res) => {
  const items = await ContactRequest.find({ user: req.user!._id })
    .select("type subject message status response createdAt updatedAt targetExpert")
    .populate({ path: "targetExpert", select: "headline user", populate: { path: "user", select: "name" } })
    .sort({ createdAt: -1 })
    .lean();
  res.json(items);
});

const profileInput = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  phone: z.string().trim().max(30).optional(),
  profile: z.object({
    designation: z.string().trim().max(120).optional(),
    department: z.string().trim().max(120).optional(),
    bio: z.string().trim().max(2000).optional(),
    interests: z.array(z.string().trim().max(60)).max(20).optional(),
    location: z.string().trim().max(120).optional(),
    linkedin: z.string().trim().max(300).optional(),
    institution: z.string().trim().max(160).optional(),
    graduationYear: z.number().int().min(1950).max(2100).nullable().optional(),
  }),
});

meRouter.put("/profile", async (req, res) => {
  const data = parse(profileInput, req.body);
  if (data.profile.linkedin && !/^https:\/\/(www\.)?linkedin\.com\//.test(data.profile.linkedin)) {
    throw new HttpError(400, "Enter a LinkedIn profile URL", { "profile.linkedin": "Must be a linkedin.com URL" });
  }
  const user = await User.findByIdAndUpdate(req.user!._id, { name: data.name, phone: data.phone, profile: data.profile }, { returnDocument: "after", runValidators: true }).lean();
  res.json({ name: user?.name, phone: user?.phone, profile: user?.profile });
});

/** Organization accounts can view and edit their organization's public profile draft. */
meRouter.get("/organization", async (req, res) => {
  if (!req.user!.organization) return res.json(null);
  res.json(await Organization.findById(req.user!.organization).select("-contact").lean());
});

meRouter.put("/organization", async (req, res) => {
  if (!req.user!.organization || req.user!.accountType !== "organization") throw new HttpError(403, "No organization is linked to your account");
  const data = parse(
    z.object({
      description: z.string().trim().max(3000).optional(),
      website: z.string().trim().max(300).optional(),
      location: z.string().trim().max(160).optional(),
      collaborationAreas: z.array(z.string().trim().max(80)).max(30).optional(),
    }),
    req.body,
  );
  if (data.website && !/^https?:\/\//.test(data.website)) throw new HttpError(400, "Website must start with http(s)://", { website: "Invalid URL" });
  const org = await Organization.findByIdAndUpdate(req.user!.organization, data, { returnDocument: "after" }).select("-contact").lean();
  res.json(org);
});
