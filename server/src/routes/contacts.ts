import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { audit } from "../lib/audit.js";
import { isId, notFound, oid, paged, pagination, parse, searchRegex, str, toCsv, type Filter } from "../lib/http.js";
import { PERMISSIONS } from "../lib/permissions.js";
import { requirePermission } from "../middleware/auth.js";
import { CONTACT_STATUSES, CONTACT_TYPES, ContactRequest } from "../models/admin.js";
import { notify, notifyPermission } from "../lib/notify.js";
import { requireFeature } from "../lib/features.js";

export const contactRouter = Router();
export const adminContactsRouter = Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  message: { error: "Too many messages from this connection. Please try again later." },
});

const contactInput = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().max(30).optional(),
  organization: z.string().trim().max(160).optional(),
  category: z.string().trim().min(1, "Select a category").max(60),
  type: z.enum(CONTACT_TYPES.filter((t) => t !== "expert_connect") as [string, ...string[]], { message: "Select a requirement type" }),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(10, "Message should be at least 10 characters").max(5000),
  /** Honeypot: real users never see or fill this field. */
  website: z.string().max(0).optional(),
  startedAt: z.number().optional(),
});

contactRouter.post("/", contactLimiter, requireFeature("contact"), async (req, res) => {
  const data = parse(contactInput, req.body);
  // Submissions completed implausibly fast are treated as automated, but acknowledged identically.
  const tooFast = data.startedAt && Date.now() - data.startedAt < 2500;
  if (!tooFast) {
    const request = await ContactRequest.create({
      type: data.type as (typeof CONTACT_TYPES)[number],
      name: data.name,
      email: data.email,
      phone: data.phone,
      organization: data.organization,
      category: data.category,
      subject: data.subject,
      message: data.message,
      user: req.user?._id,
      ip: req.ip,
    });
    await notifyPermission(PERMISSIONS.contactsManage, {
      kind: "request",
      title: `New ${request.type.replace("_", " ")} request from ${request.name}`,
      body: request.subject ?? request.message.slice(0, 140),
      link: `/admin/requests?open=${request._id}`,
    });
  }
  res.status(201).json({ message: "Thank you for reaching out. The BIAN secretariat will get back to you shortly." });
});

// ---------------------------------------------------------------- admin

adminContactsRouter.use(requirePermission(PERMISSIONS.adminAccess, PERMISSIONS.contactsManage), requireFeature("admin.requests"));

function filter(query: Record<string, unknown>) {
  const f: Filter = {};
  const status = str(query.status);
  if (status) f.status = status;
  const type = str(query.type);
  if (type) f.type = type;
  const assigned = str(query.assignedTo);
  if (assigned && isId(assigned)) f.assignedTo = oid(assigned);
  const q = str(query.q);
  if (q) f.$or = [{ name: searchRegex(q) }, { email: searchRegex(q) }, { organization: searchRegex(q) }, { subject: searchRegex(q) }, { message: searchRegex(q) }];
  return f;
}

adminContactsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = pagination(req, 20);
  const f = filter(req.query);
  const [items, total, counts] = await Promise.all([
    ContactRequest.find(f)
      .populate("assignedTo", "name")
      .populate({ path: "targetExpert", select: "headline user", populate: { path: "user", select: "name" } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ContactRequest.countDocuments(f),
    ContactRequest.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  res.json({ ...paged(items, total, page, limit), statusCounts: Object.fromEntries(counts.map((c) => [c._id, c.n])) });
});

adminContactsRouter.get("/export.csv", async (req, res) => {
  const items = await ContactRequest.find(filter(req.query)).sort({ createdAt: -1 }).limit(10000).lean();
  await audit(req, "export", "ContactRequest", null, `Exported ${items.length} contact requests`);
  res
    .type("text/csv")
    .attachment("contact-requests.csv")
    .send(toCsv(items as unknown as Record<string, unknown>[], ["createdAt", "type", "status", "name", "email", "organization", "category", "subject", "message"]));
});

adminContactsRouter.get("/:id", async (req, res) => {
  const item = await ContactRequest.findById(oid(String(req.params.id)))
    .populate("assignedTo", "name email")
    .populate("notes.author", "name")
    .populate("user", "name email category")
    .populate({ path: "targetExpert", select: "headline user", populate: { path: "user", select: "name email" } })
    .lean();
  if (!item) throw notFound("Request");
  res.json(item);
});

adminContactsRouter.patch("/:id", async (req, res) => {
  const data = parse(
    z.object({
      status: z.enum(CONTACT_STATUSES).optional(),
      assignedTo: z.string().refine(isId).nullable().optional(),
      response: z.string().trim().max(5000).optional(),
    }),
    req.body,
  );
  const item = await ContactRequest.findById(oid(String(req.params.id)));
  if (!item) throw notFound("Request");
  const before = item.status;
  const previousResponse = item.response ?? "";
  if (data.status) item.status = data.status;
  if (data.assignedTo !== undefined) item.set("assignedTo", data.assignedTo);
  if (data.response !== undefined) {
    item.response = data.response;
    if (data.response && item.status === "new") item.status = "responded";
  }
  await item.save();
  await audit(req, "contact.update", "ContactRequest", item._id, `Request from ${item.email}: ${before} → ${item.status}`);
  if (item.user) {
    const replied = !!item.response && item.response !== previousResponse;
    if (replied || item.status !== before) {
      await notify([item.user], {
        kind: "request_update",
        title: replied ? `The BIAN secretariat replied to "${item.subject ?? "your request"}"` : `Your request is now ${item.status.replace("_", " ")}`,
        body: replied ? item.response!.slice(0, 200) : item.subject ?? undefined,
        link: "/dashboard/requests",
      }, req.user!._id);
    }
  }
  res.json(item);
});

adminContactsRouter.post("/:id/notes", async (req, res) => {
  const { text } = parse(z.object({ text: z.string().trim().min(1, "Note cannot be empty").max(3000) }), req.body);
  const item = await ContactRequest.findByIdAndUpdate(
    oid(String(req.params.id)),
    { $push: { notes: { author: req.user!._id, text, at: new Date() } } },
    { returnDocument: "after" },
  ).populate("notes.author", "name");
  if (!item) throw notFound("Request");
  res.status(201).json(item.notes);
});
