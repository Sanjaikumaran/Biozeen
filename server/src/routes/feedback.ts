import { createHmac } from "node:crypto";
import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import mongoose, { type PipelineStage } from "mongoose";
import { z } from "zod";
import { config } from "../config.js";
import { canView } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { feedbackFormIdsInBlocks } from "../lib/blocks.js";
import { HttpError, isId, notFound, oid, paged, pagination, parse, searchRegex, str, toCsv, type Filter } from "../lib/http.js";
import { PERMISSIONS } from "../lib/permissions.js";
import { can, requireAuth, requirePermission } from "../middleware/auth.js";
import type { Block } from "../models/common.js";
import { Content } from "../models/content.js";
import { FeedbackForm, FeedbackSubmission, QUESTION_TYPES } from "../models/feedback.js";
import { User } from "../models/identity.js";
import { Course, Event } from "../models/learning.js";

export const feedbackRouter = Router();
export const adminFeedbackRouter = Router();

const TARGET_KINDS = ["content", "course", "lesson", "event"] as const;
type TargetKind = (typeof TARGET_KINDS)[number];

interface ResolvedTarget {
  kind: TargetKind;
  title: string;
  type: string;
  formIds: string[];
  refs: { content?: mongoose.Types.ObjectId; course?: mongoose.Types.ObjectId; lessonId?: mongoose.Types.ObjectId; event?: mongoose.Types.ObjectId };
}

/** Load the item being evaluated, enforce that the viewer may see it, and list forms attached to it. */
async function resolveTarget(kind: TargetKind, targetId: string, lessonId: string | undefined, user: Request["user"]): Promise<ResolvedTarget> {
  const id = oid(targetId);
  const formsOf = (blocks: Block[], direct?: unknown) => [...feedbackFormIdsInBlocks(blocks), ...(direct ? [String(direct)] : [])];
  if (kind === "content") {
    const c = await Content.findById(id).lean();
    if (!c || !canView(c, user)) throw notFound("Content");
    return { kind, title: c.title, type: c.type, formIds: formsOf(c.blocks, c.feedbackForm), refs: { content: c._id } };
  }
  if (kind === "event") {
    const e = await Event.findById(id).lean();
    if (!e || !canView(e, user)) throw notFound("Event");
    return { kind, title: e.title, type: "event", formIds: formsOf(e.blocks, e.feedbackForm), refs: { event: e._id } };
  }
  const course = await Course.findById(id).lean();
  if (!course || !canView(course, user)) throw notFound("Course");
  if (kind === "course") {
    return { kind, title: course.title, type: "course", formIds: formsOf([], course.feedbackForm), refs: { course: course._id } };
  }
  const lesson = course.modules.flatMap((m) => m.lessons).find((l) => String(l._id) === lessonId);
  if (!lesson) throw notFound("Lesson");
  return {
    kind,
    title: `${course.title} › ${lesson.title}`,
    type: "lesson",
    formIds: formsOf(lesson.blocks, lesson.feedbackForm),
    refs: { course: course._id, lessonId: lesson._id },
  };
}

const targetQuery = (t: ResolvedTarget) => ({
  targetKind: t.kind,
  ...(t.refs.content ? { content: t.refs.content } : {}),
  ...(t.refs.event ? { event: t.refs.event } : {}),
  ...(t.refs.course ? { course: t.refs.course } : {}),
  ...(t.kind === "lesson" ? { lessonId: t.refs.lessonId } : {}),
});

const dedupeKey = (userId: string, formId: string, t: ResolvedTarget) =>
  createHmac("sha256", config.jwtSecret)
    .update(`${userId}:${formId}:${t.kind}:${t.refs.content ?? t.refs.event ?? t.refs.course}:${t.refs.lessonId ?? ""}`)
    .digest("hex");

const submitLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, message: { error: "Too many submissions. Please try again later." } });

const submitSchema = z.object({
  formId: z.string().refine(isId),
  targetKind: z.enum(TARGET_KINDS),
  targetId: z.string().refine(isId),
  lessonId: z.string().refine(isId).optional(),
  anonymous: z.boolean().optional(),
  answers: z.record(z.string(), z.unknown()),
});

type FormQuestion = { _id: mongoose.Types.ObjectId; type: string; label: string; required?: boolean | null; options: { _id: mongoose.Types.ObjectId; label: string }[]; scaleMax?: number | null; maxLength?: number | null };

function validateAnswer(q: FormQuestion, raw: unknown): unknown {
  const empty = raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0);
  if (empty) {
    if (q.required) throw new HttpError(400, "Please answer all required questions", { [String(q._id)]: "This question is required" });
    return undefined;
  }
  const bad = () => new HttpError(400, "Some answers are invalid", { [String(q._id)]: "Invalid answer" });
  const optionIds = new Set(q.options.map((o) => String(o._id)));
  switch (q.type) {
    case "rating": {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > (q.scaleMax ?? 5)) throw bad();
      return n;
    }
    case "nps": {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 10) throw bad();
      return n;
    }
    case "yes_no":
      if (typeof raw !== "boolean") throw bad();
      return raw;
    case "single_choice":
      if (typeof raw !== "string" || !optionIds.has(raw)) throw bad();
      return raw;
    case "multiple_choice":
      if (!Array.isArray(raw) || !raw.every((v) => typeof v === "string" && optionIds.has(v))) throw bad();
      return [...new Set(raw)];
    case "short_text":
    case "long_text":
      if (typeof raw !== "string") throw bad();
      return raw.trim().slice(0, q.maxLength ?? (q.type === "short_text" ? 300 : 2000));
    default:
      throw bad();
  }
}

feedbackRouter.post("/submit", submitLimiter, async (req, res) => {
  const data = parse(submitSchema, req.body);
  const form = await FeedbackForm.findById(data.formId).lean();
  if (!form || form.status !== "active") throw new HttpError(400, "This feedback form is not accepting responses");
  const target = await resolveTarget(data.targetKind, data.targetId, data.lessonId, req.user);
  if (!target.formIds.includes(String(form._id))) throw new HttpError(400, "This form is not attached to that item");

  const anonymous = form.anonymity === "anonymous" || (form.anonymity === "optional" && (data.anonymous || !req.user));
  if (!anonymous && !req.user) throw new HttpError(401, "Please sign in to submit feedback");

  if (form.submissionPolicy === "once" && req.user) {
    const key = dedupeKey(req.user.id, String(form._id), target);
    const exists = await FeedbackSubmission.exists({
      form: form._id,
      ...targetQuery(target),
      $or: [{ user: req.user._id }, { dedupeKey: key }],
    });
    if (exists) throw new HttpError(409, "You have already submitted feedback for this item");
  }

  const answers = [];
  const ratings: number[] = [];
  for (const q of form.questions as FormQuestion[]) {
    const value = validateAnswer(q, data.answers[String(q._id)]);
    if (value === undefined) continue;
    answers.push({ questionId: q._id, label: q.label, type: q.type, value });
    if (q.type === "rating") ratings.push(((value as number) / (q.scaleMax ?? 5)) * 5);
  }
  if (!answers.length) throw new HttpError(400, "Please answer at least one question");

  await FeedbackSubmission.create({
    form: form._id,
    formVersion: form.version,
    targetTitle: target.title,
    targetType: target.type,
    ...targetQuery(target),
    user: anonymous ? undefined : req.user!._id,
    respondentCategory: anonymous ? undefined : req.user!.category,
    respondentRoles: anonymous ? [] : req.user!.roleIds,
    anonymous,
    dedupeKey: anonymous && req.user && form.submissionPolicy === "once" ? dedupeKey(req.user.id, String(form._id), target) : undefined,
    answers,
    ratingAvg: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : undefined,
  });
  res.status(201).json({ message: "Thank you — your feedback has been recorded." });
});

feedbackRouter.get("/status", requireAuth, async (req, res) => {
  const formId = str(req.query.formId);
  const kind = str(req.query.targetKind) as TargetKind | undefined;
  const targetId = str(req.query.targetId);
  if (!formId || !isId(formId) || !kind || !TARGET_KINDS.includes(kind) || !targetId) throw new HttpError(400, "Missing parameters");
  const target = await resolveTarget(kind, targetId, str(req.query.lessonId), req.user);
  const exists = await FeedbackSubmission.exists({
    form: formId,
    ...targetQuery(target),
    $or: [{ user: req.user!._id }, { dedupeKey: dedupeKey(req.user!.id, formId, target) }],
  });
  res.json({ submitted: !!exists });
});

/** The member's own identified feedback. Anonymous responses are never linked back. */
feedbackRouter.get("/mine", requireAuth, async (req, res) => {
  const items = await FeedbackSubmission.find({ user: req.user!._id }).populate("form", "title").sort({ submittedAt: -1 }).limit(50).lean();
  res.json(items);
});

// ---------------------------------------------------------------- admin: forms

const questionInput = z.object({
  _id: z.string().refine(isId).optional(),
  type: z.enum(QUESTION_TYPES),
  label: z.string().trim().min(1, "Question label is required").max(300),
  help: z.string().max(500).optional(),
  required: z.boolean().default(false),
  options: z.array(z.object({ _id: z.string().refine(isId).optional(), label: z.string().trim().min(1).max(200) })).max(30).default([]),
  scaleMax: z.number().int().min(2).max(10).default(5),
  maxLength: z.number().int().min(10).max(5000).optional(),
});

const formInput = z.object({
  title: z.string().trim().min(2, "Title is required").max(200),
  description: z.string().max(1000).optional(),
  questions: z
    .array(questionInput)
    .min(1, "Add at least one question")
    .max(50)
    .refine((qs) => qs.every((q) => !["single_choice", "multiple_choice"].includes(q.type) || q.options.length >= 2), "Choice questions need at least two options"),
  anonymity: z.enum(["identified", "anonymous", "optional"]),
  submissionPolicy: z.enum(["once", "multiple"]),
  status: z.enum(["draft", "active", "closed"]),
});

const formsAdmin = Router();
formsAdmin.use(requirePermission(PERMISSIONS.adminAccess, PERMISSIONS.feedbackManage));

formsAdmin.get("/", async (_req, res) => {
  const forms = await FeedbackForm.find().select("-history").sort({ updatedAt: -1 }).lean();
  const counts = await FeedbackSubmission.aggregate<{ _id: unknown; n: number }>([{ $group: { _id: "$form", n: { $sum: 1 } } }]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json(forms.map((f) => ({ ...f, responses: byId.get(String(f._id)) ?? 0 })));
});

formsAdmin.get("/:id", async (req, res) => {
  const form = await FeedbackForm.findById(oid(String(req.params.id))).lean();
  if (!form) throw notFound("Form");
  res.json(form);
});

formsAdmin.post("/", async (req, res) => {
  const data = parse(formInput, req.body);
  const form = await FeedbackForm.create({ ...data, createdBy: req.user!._id });
  await audit(req, "feedbackForm.create", "FeedbackForm", form._id, `Created form "${form.title}"`);
  res.status(201).json(form);
});

const questionSignature = (qs: unknown[]) =>
  JSON.stringify(
    (qs as { _id?: unknown; type: string; label: string; options?: { _id?: unknown; label: string }[]; scaleMax?: number }[]).map((q) => [
      String(q._id ?? ""),
      q.type,
      q.label,
      (q.options ?? []).map((o) => [String(o._id ?? ""), o.label]),
      q.scaleMax ?? 5,
    ]),
  );

formsAdmin.put("/:id", async (req, res) => {
  const data = parse(formInput, req.body);
  const form = await FeedbackForm.findById(oid(String(req.params.id)));
  if (!form) throw notFound("Form");
  const changed = questionSignature(form.questions) !== questionSignature(data.questions);
  if (changed && (await FeedbackSubmission.exists({ form: form._id }))) {
    // Keep the previous question set so historical answers retain their meaning.
    form.history.push({ version: form.version, questions: form.questions.toObject(), createdAt: new Date() });
    form.version += 1;
  }
  form.set(data);
  await form.save();
  await audit(req, "feedbackForm.update", "FeedbackForm", form._id, `Updated form "${form.title}" (v${form.version})`);
  res.json(form);
});

formsAdmin.delete("/:id", async (req, res) => {
  const id = oid(String(req.params.id));
  if (await FeedbackSubmission.exists({ form: id })) throw new HttpError(409, "This form has responses. Close it instead of deleting.");
  const form = await FeedbackForm.findByIdAndDelete(id);
  if (!form) throw notFound("Form");
  await audit(req, "feedbackForm.delete", "FeedbackForm", form._id, `Deleted form "${form.title}"`);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- admin: analytics & responses

const analyticsAdmin = Router();
analyticsAdmin.use(requirePermission(PERMISSIONS.adminAccess, PERMISSIONS.feedbackView));

/** Build the submission filter, rejecting identity-based filters without the right permission. */
function submissionFilter(req: Request): Filter {
  const q = req.query;
  const f: Filter = {};
  const from = str(q.from);
  const to = str(q.to);
  if (from || to) {
    f.submittedAt = {};
    if (from) f.submittedAt.$gte = new Date(from);
    if (to) f.submittedAt.$lte = new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1);
  }
  const kind = str(q.targetKind);
  if (kind) f.targetKind = kind;
  const type = str(q.targetType);
  if (type) f.targetType = type;
  for (const [param, field] of [["formId", "form"], ["contentId", "content"], ["courseId", "course"], ["lessonId", "lessonId"], ["eventId", "event"]] as const) {
    const v = str(q[param]);
    if (v) f[field] = oid(v);
  }
  const minRating = Number(q.minRating);
  const maxRating = Number(q.maxRating);
  if (minRating || maxRating) f.ratingAvg = { ...(minRating ? { $gte: minRating } : {}), ...(maxRating ? { $lte: maxRating } : {}) };
  if (q.anonymous === "true") f.anonymous = true;
  if (q.anonymous === "false") f.anonymous = false;
  const userId = str(q.userId);
  const category = str(q.category);
  const role = str(q.roleId);
  if ((userId || category || role) && !can(req.user, PERMISSIONS.feedbackViewIdentified)) {
    throw new HttpError(403, "Filtering by respondent requires permission to view identified feedback");
  }
  if (userId) f.user = oid(userId);
  if (category) f.respondentCategory = category;
  if (role) f.respondentRoles = oid(role);
  return f;
}

analyticsAdmin.get("/summary", async (req, res) => {
  const match = submissionFilter(req);
  const pipeline = (stages: PipelineStage[]) => FeedbackSubmission.aggregate([{ $match: match }, ...stages]);

  const [totals, trend, byTarget, questionStats, distribution] = await Promise.all([
    pipeline([{ $group: { _id: null, count: { $sum: 1 }, avg: { $avg: "$ratingAvg" }, anonymous: { $sum: { $cond: ["$anonymous", 1, 0] } } } }]),
    pipeline([
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$submittedAt" } }, count: { $sum: 1 }, avg: { $avg: "$ratingAvg" } } },
      { $sort: { _id: 1 } },
      { $limit: 366 },
    ]),
    pipeline([
      {
        $group: {
          _id: { kind: "$targetKind", content: "$content", course: "$course", lessonId: "$lessonId", event: "$event" },
          title: { $last: "$targetTitle" },
          type: { $last: "$targetType" },
          count: { $sum: 1 },
          avg: { $avg: "$ratingAvg" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]),
    pipeline([
      { $unwind: "$answers" },
      { $match: { "answers.type": { $in: ["rating", "nps", "yes_no", "single_choice", "multiple_choice"] } } },
      { $unwind: { path: "$answers.value", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { q: "$answers.questionId", v: "$answers.value" },
          label: { $last: "$answers.label" },
          type: { $last: "$answers.type" },
          n: { $sum: 1 },
        },
      },
    ]),
    pipeline([{ $match: { ratingAvg: { $ne: null } } }, { $group: { _id: { $round: ["$ratingAvg", 0] }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
  ]);

  // Resolve choice option labels from the forms involved (current version + history).
  const formIds = await FeedbackSubmission.distinct("form", match);
  const forms = await FeedbackForm.find({ _id: { $in: formIds } }).lean();
  const optionLabels = new Map<string, string>();
  for (const f of forms) for (const qs of [f.questions, ...f.history.map((h) => h.questions)]) for (const q of qs) for (const o of q.options) optionLabels.set(String(o._id), o.label);

  const questions = new Map<string, { questionId: string; label: string; type: string; total: number; breakdown: { value: string; label: string; count: number }[]; average?: number }>();
  for (const row of questionStats as { _id: { q: unknown; v: unknown }; label: string; type: string; n: number }[]) {
    const key = String(row._id.q);
    const entry = questions.get(key) ?? { questionId: key, label: row.label, type: row.type, total: 0, breakdown: [] };
    const v = row._id.v;
    const label = typeof v === "boolean" ? (v ? "Yes" : "No") : optionLabels.get(String(v)) ?? String(v);
    entry.breakdown.push({ value: String(v), label, count: row.n });
    entry.total += row.n;
    questions.set(key, entry);
  }
  for (const q of questions.values()) {
    if (q.type === "rating" || q.type === "nps") {
      q.breakdown.sort((a, b) => Number(a.value) - Number(b.value));
      q.average = Math.round((q.breakdown.reduce((s, b) => s + Number(b.value) * b.count, 0) / q.total) * 100) / 100;
    } else q.breakdown.sort((a, b) => b.count - a.count);
  }

  const total = totals[0] as { count: number; avg: number | null; anonymous: number } | undefined;
  res.json({
    total: total?.count ?? 0,
    averageRating: total?.avg ? Math.round(total.avg * 100) / 100 : null,
    anonymousCount: total?.anonymous ?? 0,
    trend: trend.map((t: { _id: string; count: number; avg: number | null }) => ({ date: t._id, count: t.count, avg: t.avg ? Math.round(t.avg * 100) / 100 : null })),
    ratingDistribution: distribution.map((d: { _id: number; n: number }) => ({ rating: d._id, count: d.n })),
    byTarget: byTarget.map((t: { _id: Record<string, unknown>; title: string; type: string; count: number; avg: number | null }) => ({ ...t._id, title: t.title, type: t.type, count: t.count, avg: t.avg ? Math.round(t.avg * 100) / 100 : null })),
    questions: [...questions.values()],
  });
});

/** Distinct targets that have feedback, for filter dropdowns. */
analyticsAdmin.get("/targets", async (_req, res) => {
  const rows = await FeedbackSubmission.aggregate([
    { $group: { _id: { kind: "$targetKind", content: "$content", course: "$course", lessonId: "$lessonId", event: "$event" }, title: { $last: "$targetTitle" }, type: { $last: "$targetType" } } },
    { $sort: { title: 1 } },
  ]);
  const forms = await FeedbackForm.find().select("title").lean();
  const courses = await Course.find().select("title modules._id modules.title modules.lessons._id modules.lessons.title").lean();
  res.json({ targets: rows.map((r) => ({ ...r._id, title: r.title, type: r.type })), forms, courses });
});

function presentSubmission(s: Record<string, unknown> & { anonymous?: boolean; user?: unknown }, identified: boolean) {
  const { user, respondentCategory, respondentRoles: _r, ...rest } = s;
  if (s.anonymous || !identified) return { ...rest, user: null, respondentCategory: s.anonymous ? null : identified ? respondentCategory : null };
  return { ...rest, user, respondentCategory };
}

analyticsAdmin.get("/responses", async (req, res) => {
  const { page, limit, skip } = pagination(req, 20);
  const f = submissionFilter(req);
  const identified = can(req.user, PERMISSIONS.feedbackViewIdentified);
  const q = str(req.query.q);
  if (q) f["answers.value"] = searchRegex(q);
  const [items, total] = await Promise.all([
    FeedbackSubmission.find(f).populate("form", "title").populate(identified ? { path: "user", select: "name email category" } : []).sort({ submittedAt: -1 }).skip(skip).limit(limit).lean(),
    FeedbackSubmission.countDocuments(f),
  ]);
  const forms = await FeedbackForm.find({ _id: { $in: items.map((i) => (i.form as { _id: unknown })?._id) } }).lean();
  const optionLabels = new Map<string, string>();
  for (const fm of forms) for (const qs of [fm.questions, ...fm.history.map((h) => h.questions)]) for (const qq of qs) for (const o of qq.options) optionLabels.set(String(o._id), o.label);
  const withLabels = items.map((i) => ({
    ...i,
    answers: i.answers.map((a) => ({
      ...a,
      display: Array.isArray(a.value) ? a.value.map((v: unknown) => optionLabels.get(String(v)) ?? v).join(", ") : typeof a.value === "boolean" ? (a.value ? "Yes" : "No") : optionLabels.get(String(a.value)) ?? a.value,
    })),
  }));
  res.json(paged(withLabels.map((i) => presentSubmission(i as never, identified)), total, page, limit));
});

analyticsAdmin.get("/users", requirePermission(PERMISSIONS.feedbackViewIdentified), async (req, res) => {
  const q = str(req.query.q);
  const users = await FeedbackSubmission.aggregate([
    { $match: { user: { $ne: null }, anonymous: false } },
    { $group: { _id: "$user", count: { $sum: 1 }, avg: { $avg: "$ratingAvg" }, last: { $max: "$submittedAt" } } },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u", pipeline: [{ $project: { name: 1, email: 1, category: 1 } }] } },
    { $unwind: "$u" },
    ...(q ? [{ $match: { $or: [{ "u.name": searchRegex(q) }, { "u.email": searchRegex(q) }] } }] : []),
    { $sort: { last: -1 } },
    { $limit: 100 },
  ]);
  res.json(users.map((u) => ({ userId: u._id, name: u.u.name, email: u.u.email, category: u.u.category, count: u.count, avg: u.avg ? Math.round(u.avg * 100) / 100 : null, last: u.last })));
});

analyticsAdmin.get("/export.csv", async (req, res) => {
  const f = submissionFilter(req);
  const identified = can(req.user, PERMISSIONS.feedbackViewIdentified);
  const items = await FeedbackSubmission.find(f).populate("form", "title").sort({ submittedAt: -1 }).limit(10000).lean();
  const users = identified ? await User.find({ _id: { $in: items.map((i) => i.user).filter(Boolean) } }).select("name email").lean() : [];
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const questionLabels = [...new Set(items.flatMap((i) => i.answers.map((a) => a.label ?? "")))];
  const rows = items.map((i) => {
    const u = !i.anonymous && identified && i.user ? userMap.get(String(i.user)) : undefined;
    const row: Record<string, unknown> = {
      submittedAt: i.submittedAt,
      form: (i.form as { title?: string })?.title,
      formVersion: i.formVersion,
      targetType: i.targetType,
      target: i.targetTitle,
      respondent: i.anonymous ? "Anonymous" : u ? `${u.name} <${u.email}>` : "Hidden",
      category: i.anonymous || !identified ? "" : i.respondentCategory,
      ratingAvg: i.ratingAvg,
    };
    for (const a of i.answers) row[a.label ?? ""] = Array.isArray(a.value) ? a.value.join("; ") : a.value;
    return row;
  });
  await audit(req, "export", "FeedbackSubmission", null, `Exported ${rows.length} feedback responses`, { identified });
  res.type("text/csv").attachment("feedback.csv").send(toCsv(rows, ["submittedAt", "form", "formVersion", "targetType", "target", "respondent", "category", "ratingAvg", ...questionLabels]));
});

adminFeedbackRouter.use("/forms", formsAdmin);
adminFeedbackRouter.use("/analytics", analyticsAdmin);
