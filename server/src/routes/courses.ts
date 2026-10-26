import { Router } from "express";
import { z } from "zod";
import { canView, isLive, visibleFilter } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { cleanBlocks, mediaIdsInBlocks, safeUrl } from "../lib/blocks.js";
import { HttpError, isId, notFound, oid, paged, pagination, parse, searchRegex, slugify, str, type Filter } from "../lib/http.js";
import { PERMISSIONS } from "../lib/permissions.js";
import { accessInput, applyStatus, dateInput, dropDisabledFields, mediaIdFromUrl, syncMediaLinks } from "../lib/publishing.js";
import { publicForm, resolveBlocks } from "../lib/resolve.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { PUBLICATION_STATUSES } from "../models/common.js";
import { FeedbackForm } from "../models/feedback.js";
import { Course, Enrollment } from "../models/learning.js";
import { isFeatureOn, requireFeature } from "../lib/features.js";

export const coursesRouter = Router();
export const adminCoursesRouter = Router();

type CourseLean = NonNullable<Awaited<ReturnType<typeof loadCourse>>>;

async function loadCourse(slugOrId: string) {
  return Course.findOne(isId(slugOrId) ? { _id: slugOrId } : { slug: slugOrId })
    .populate("categories", "name slug")
    .populate("author", "name")
    .lean();
}

/** Course outline without lesson bodies — safe to show to anyone allowed to see the course. */
function outline(course: CourseLean) {
  return course.modules.map((m) => ({
    _id: m._id,
    title: m.title,
    summary: m.summary,
    lessons: m.lessons.map((l) => ({ _id: l._id, title: l.title, summary: l.summary, durationMinutes: l.durationMinutes })),
  }));
}

const lessonCount = (course: { modules: { lessons: unknown[] }[] }) => course.modules.reduce((n, m) => n + m.lessons.length, 0);

coursesRouter.get("/", requireFeature("knowledge.courses"), async (req, res) => {
  const { page, limit, skip } = pagination(req);
  const f: Filter = {};
  const q = str(req.query.q);
  if (q) f.$or = [{ title: searchRegex(q) }, { summary: searchRegex(q) }];
  const filter = { $and: [f, visibleFilter(req.user)] };
  const [items, total] = await Promise.all([
    Course.find(filter).select("-modules.lessons.blocks -description").sort({ publishedAt: -1 }).skip(skip).limit(limit).lean(),
    Course.countDocuments(filter),
  ]);
  res.json(
    paged(
      items.map(({ modules, ...c }) => ({ ...c, moduleCount: modules.length, lessonCount: lessonCount({ modules }) })),
      total,
      page,
      limit,
    ),
  );
});

function assertViewable(course: CourseLean | null, user: Express.Request["user"]): asserts course is CourseLean {
  if (!course) throw notFound("Course");
  if (!canView(course, user)) {
    if (!isLive(course)) throw notFound("Course");
    if (!user) throw new HttpError(401, "This course is available to signed-in members", { restricted: true });
    throw new HttpError(403, "This course is restricted to selected member roles", { restricted: true });
  }
}

coursesRouter.get("/:slug", requireFeature("knowledge.courses"), async (req, res) => {
  const course = await loadCourse(String(req.params.slug));
  assertViewable(course, req.user);
  const enrollment = req.user ? await Enrollment.findOne({ user: req.user._id, course: course._id }).lean() : null;
  const form = course.feedbackForm && (await isFeatureOn("feedback", req.user)) && (await FeedbackForm.findOne({ _id: course.feedbackForm, status: "active" }).lean());
  const { modules: _modules, ...rest } = course;
  res.json({
    ...rest,
    modules: outline(course),
    lessonCount: lessonCount(course),
    enrollment,
    feedbackForm: form ? publicForm(form) : null,
    preview: !isLive(course),
  });
});

coursesRouter.get("/:slug/lessons/:lessonId", requireFeature("knowledge.courses"), async (req, res) => {
  const course = await loadCourse(String(req.params.slug));
  assertViewable(course, req.user);
  const flat = course.modules.flatMap((m) => m.lessons.map((l) => ({ module: m, lesson: l })));
  const index = flat.findIndex((x) => String(x.lesson._id) === req.params.lessonId);
  const entry = flat[index];
  if (!entry) throw notFound("Lesson");
  const enrollment = req.user ? await Enrollment.findOne({ user: req.user._id, course: course._id }).lean() : null;
  const form = entry.lesson.feedbackForm && (await isFeatureOn("feedback", req.user)) && (await FeedbackForm.findOne({ _id: entry.lesson.feedbackForm, status: "active" }).lean());
  const prev = flat[index - 1];
  const next = flat[index + 1];
  res.json({
    course: { _id: course._id, title: course.title, slug: course.slug, trackCompletion: course.trackCompletion, modules: outline(course) },
    module: { _id: entry.module._id, title: entry.module.title },
    lesson: { ...entry.lesson, blocks: await resolveBlocks(entry.lesson.blocks, req.user), feedbackForm: form ? publicForm(form) : null },
    prev: prev ? { _id: prev.lesson._id, title: prev.lesson.title } : null,
    next: next ? { _id: next.lesson._id, title: next.lesson.title } : null,
    enrollment,
  });
});

coursesRouter.post("/:id/enroll", requireAuth, requireFeature("knowledge.courses.enroll"), async (req, res) => {
  const course = await loadCourse(String(req.params.id));
  assertViewable(course, req.user);
  const enrollment = await Enrollment.findOneAndUpdate(
    { user: req.user!._id, course: course._id },
    { $setOnInsert: { enrolledAt: new Date(), status: "active" } },
    { upsert: true, returnDocument: "after" },
  );
  res.status(201).json(enrollment);
});

coursesRouter.post("/:id/lessons/:lessonId/complete", requireAuth, requireFeature("knowledge.courses.enroll"), async (req, res) => {
  const course = await loadCourse(String(req.params.id));
  assertViewable(course, req.user);
  const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => String(l._id)));
  const lessonId = String(req.params.lessonId);
  if (!lessonIds.includes(lessonId)) throw notFound("Lesson");
  const { completed } = parse(z.object({ completed: z.boolean().default(true) }), req.body ?? {});
  const enrollment = await Enrollment.findOne({ user: req.user!._id, course: course._id });
  if (!enrollment) throw new HttpError(400, "Enroll in the course to track progress");
  const set = new Set(enrollment.completedLessons.map(String));
  if (completed) set.add(lessonId);
  else set.delete(lessonId);
  const done = lessonIds.filter((id) => set.has(id));
  enrollment.set("completedLessons", done);
  enrollment.progress = lessonIds.length ? Math.round((done.length / lessonIds.length) * 100) : 0;
  if (enrollment.progress === 100 && enrollment.status !== "completed") {
    enrollment.status = "completed";
    enrollment.completedAt = new Date();
  } else if (enrollment.progress < 100) {
    enrollment.status = "active";
    enrollment.completedAt = undefined;
  }
  await enrollment.save();
  res.json(enrollment);
});

// ---------------------------------------------------------------- admin

const lessonInput = z.object({
  _id: z.string().refine(isId).optional(),
  title: z.string().trim().min(1, "Lesson title is required").max(200),
  summary: z.string().max(600).optional(),
  durationMinutes: z.number().int().min(0).max(1000).optional(),
  blocks: z.array(z.unknown()).optional(),
  feedbackForm: z.string().refine(isId).nullable().optional(),
});

const courseInput = z.object({
  title: z.string().trim().min(2, "Title is required").max(200),
  slug: z.string().trim().max(80).optional(),
  summary: z.string().max(600).optional(),
  description: z.string().max(5000).optional(),
  thumbnail: z.string().max(500).optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  objectives: z.array(z.string().trim().max(300)).max(30).optional(),
  modules: z
    .array(
      z.object({
        _id: z.string().refine(isId).optional(),
        title: z.string().trim().min(1, "Module title is required").max(200),
        summary: z.string().max(600).optional(),
        lessons: z.array(lessonInput).max(100).default([]),
      }),
    )
    .max(50)
    .optional(),
  categories: z.array(z.string().refine(isId)).optional(),
  status: z.enum(PUBLICATION_STATUSES).optional(),
  publishAt: dateInput,
  expireAt: dateInput,
  access: accessInput.optional(),
  feedbackForm: z.string().refine(isId).nullable().optional(),
  trackCompletion: z.boolean().optional(),
});

adminCoursesRouter.use(requirePermission(PERMISSIONS.adminAccess, PERMISSIONS.contentManage), requireFeature("admin.courses"));

adminCoursesRouter.get("/", async (req, res) => {
  const { page, limit, skip } = pagination(req, 20);
  const f: Filter = {};
  const q = str(req.query.q);
  if (q) f.title = searchRegex(q);
  const status = str(req.query.status);
  if (status) f.status = status;
  const [items, total] = await Promise.all([
    Course.find(f).select("-modules.lessons.blocks").sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    Course.countDocuments(f),
  ]);
  const counts = await Enrollment.aggregate<{ _id: unknown; n: number }>([
    { $match: { course: { $in: items.map((i) => i._id) } } },
    { $group: { _id: "$course", n: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json(paged(items.map((i) => ({ ...i, enrollments: byId.get(String(i._id)) ?? 0, lessonCount: lessonCount(i) })), total, page, limit));
});

adminCoursesRouter.get("/:id", async (req, res) => {
  const course = await Course.findById(oid(String(req.params.id))).lean();
  if (!course) throw notFound("Course");
  res.json(course);
});

function applyCourse(doc: InstanceType<typeof Course>, data: z.infer<typeof courseInput>) {
  doc.title = data.title;
  for (const key of ["summary", "description", "level", "publishAt", "expireAt", "trackCompletion"] as const) {
    if (data[key] !== undefined) doc.set(key, data[key]);
  }
  if (data.thumbnail !== undefined) doc.thumbnail = safeUrl(data.thumbnail);
  if (data.objectives) doc.set("objectives", data.objectives.filter(Boolean));
  if (data.categories) doc.set("categories", data.categories);
  if (data.access) doc.set("access", data.access);
  if (data.feedbackForm !== undefined) doc.set("feedbackForm", data.feedbackForm);
  if (data.modules) {
    doc.set(
      "modules",
      data.modules.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => ({ ...l, blocks: cleanBlocks(l.blocks ?? []) })),
      })),
    );
  }
}

async function afterCourseSave(doc: InstanceType<typeof Course>) {
  const ids = doc.modules.flatMap((m) => m.lessons.flatMap((l) => mediaIdsInBlocks(l.blocks)));
  const thumb = mediaIdFromUrl(doc.thumbnail);
  if (thumb) ids.push(thumb);
  await syncMediaLinks("course", doc._id, ids);
}

async function uniqueCourseSlug(wanted: string, excludeId?: unknown) {
  const base = slugify(wanted) || "course";
  let slug = base;
  for (let i = 2; await Course.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }); i++) slug = `${base}-${i}`;
  return slug;
}

adminCoursesRouter.post("/", async (req, res) => {
  const data = await dropDisabledFields(parse(courseInput, req.body), req.user!);
  const doc = new Course({ author: req.user!._id, slug: await uniqueCourseSlug(data.slug || data.title) });
  applyCourse(doc, data);
  await applyStatus(doc, data.status, req.user!);
  await doc.save();
  await afterCourseSave(doc);
  await audit(req, "course.create", "Course", doc._id, `Created course "${doc.title}"`);
  res.status(201).json(doc);
});

adminCoursesRouter.put("/:id", async (req, res) => {
  const doc = await Course.findById(oid(String(req.params.id)));
  if (!doc) throw notFound("Course");
  const data = await dropDisabledFields(parse(courseInput, req.body), req.user!);
  if (data.slug && data.slug !== doc.slug) doc.slug = await uniqueCourseSlug(data.slug, doc._id);
  applyCourse(doc, data);
  await applyStatus(doc, data.status, req.user!);
  await doc.save();
  await afterCourseSave(doc);
  await audit(req, "course.update", "Course", doc._id, `Updated course "${doc.title}" (${doc.status})`);
  res.json(doc);
});

adminCoursesRouter.delete("/:id", requirePermission(PERMISSIONS.contentPublish), async (req, res) => {
  const doc = await Course.findByIdAndDelete(oid(String(req.params.id)));
  if (!doc) throw notFound("Course");
  await Enrollment.deleteMany({ course: doc._id });
  await syncMediaLinks("course", doc._id, []);
  await audit(req, "course.delete", "Course", doc._id, `Deleted course "${doc.title}"`);
  res.json({ ok: true });
});
