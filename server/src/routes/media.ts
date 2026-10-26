import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../config.js";
import { canView, inAudience, isContentManager } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { HttpError, notFound, oid, paged, pagination, parse, searchRegex, str, type Filter } from "../lib/http.js";
import { PERMISSIONS } from "../lib/permissions.js";
import { accessInput } from "../lib/publishing.js";
import { requirePermission } from "../middleware/auth.js";
import { Content, MediaAsset } from "../models/content.js";
import { Course, Event } from "../models/learning.js";
import { requireFeature } from "../lib/features.js";

export const mediaRouter = Router();
export const adminMediaRouter = Router();

/** Allow-list of MIME types → extension. SVG and HTML are excluded to avoid stored XSS. */
const ALLOWED: Record<string, { ext: string; kind: "image" | "video" | "document" }> = {
  "image/jpeg": { ext: ".jpg", kind: "image" },
  "image/png": { ext: ".png", kind: "image" },
  "image/webp": { ext: ".webp", kind: "image" },
  "image/gif": { ext: ".gif", kind: "image" },
  "video/mp4": { ext: ".mp4", kind: "video" },
  "video/webm": { ext: ".webm", kind: "video" },
  "application/pdf": { ext: ".pdf", kind: "document" },
  "application/msword": { ext: ".doc", kind: "document" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: ".docx", kind: "document" },
  "application/vnd.ms-excel": { ext: ".xls", kind: "document" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: ".xlsx", kind: "document" },
  "application/vnd.ms-powerpoint": { ext: ".ppt", kind: "document" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: ".pptx", kind: "document" },
  "text/csv": { ext: ".csv", kind: "document" },
  "text/plain": { ext: ".txt", kind: "document" },
};

/** Magic-byte checks for formats where the browser-declared MIME type is easy to spoof. */
function sniff(buf: Buffer, mime: string) {
  const hex = buf.subarray(0, 12).toString("hex");
  if (mime === "image/jpeg") return hex.startsWith("ffd8ff");
  if (mime === "image/png") return hex.startsWith("89504e47");
  if (mime === "image/gif") return hex.startsWith("47494638");
  if (mime === "image/webp") return hex.startsWith("52494646") && buf.subarray(8, 12).toString() === "WEBP";
  if (mime === "application/pdf") return buf.subarray(0, 5).toString() === "%PDF-";
  return true;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED[file.mimetype]) cb(null, true);
    else cb(new HttpError(400, "This file type is not allowed"));
  },
});

/** Serve a stored file only if the viewer may access it (directly or via linked content). */
mediaRouter.get("/:id/file", async (req, res) => {
  const asset = await MediaAsset.findById(oid(String(req.params.id))).lean();
  if (!asset) throw notFound("File");

  let allowed = isContentManager(req.user);
  if (!allowed) {
    if (asset.inheritAccess && asset.linked.length) {
      const ids = (kind: string) => asset.linked.filter((l) => l.kind === kind).map((l) => l.id);
      const [contents, courses, events] = await Promise.all([
        Content.find({ _id: { $in: ids("content") } }).select("status publishAt expireAt access").lean(),
        Course.find({ _id: { $in: ids("course") } }).select("status publishAt expireAt access").lean(),
        Event.find({ _id: { $in: ids("event") } }).select("status publishAt expireAt access").lean(),
      ]);
      allowed = [...contents, ...courses, ...events].some((item) => canView(item, req.user));
    } else {
      allowed = inAudience(asset.access, req.user);
    }
  }
  if (!allowed) throw new HttpError(req.user ? 403 : 401, "You do not have access to this file");

  const isPublic = !asset.inheritAccess && asset.access?.visibility === "public";
  res.setHeader("Cache-Control", isPublic ? "public, max-age=86400" : "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Browsers' built-in PDF viewers do not run under a sandboxed CSP.
  if (asset.mimeType !== "application/pdf") res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  const inline = asset.kind === "image" || asset.kind === "video" || asset.mimeType === "application/pdf";
  res.type(asset.mimeType);
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${asset.originalName.replace(/[^\w.\- ]/g, "_")}"`);
  res.sendFile(path.join(config.uploadDir, asset.storageKey));
});

// ---------------------------------------------------------------- admin

adminMediaRouter.use(requirePermission(PERMISSIONS.adminAccess, PERMISSIONS.mediaUpload), requireFeature("admin.media"));

adminMediaRouter.get("/", async (req, res) => {
  const { page, limit, skip } = pagination(req, 24);
  const f: Filter = {};
  const kind = str(req.query.kind);
  if (kind) f.kind = kind;
  const q = str(req.query.q);
  if (q) f.originalName = searchRegex(q);
  const [items, total] = await Promise.all([
    MediaAsset.find(f).populate("uploadedBy", "name").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    MediaAsset.countDocuments(f),
  ]);
  res.json(paged(items.map((m) => ({ ...m, url: `/api/media/${m._id}/file` })), total, page, limit));
});

adminMediaRouter.post("/", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, "Choose a file to upload");
  const meta = ALLOWED[file.mimetype]!;
  if (!sniff(file.buffer, file.mimetype)) throw new HttpError(400, "File contents do not match its type");
  const { visibility, inheritAccess } = parse(
    z.object({
      visibility: z.enum(["public", "authenticated", "private"]).default("public"),
      inheritAccess: z.enum(["true", "false"]).default("true"),
    }),
    req.body,
  );
  const storageKey = `${new Date().toISOString().slice(0, 7)}/${randomBytes(16).toString("hex")}${meta.ext}`;
  await fs.mkdir(path.join(config.uploadDir, path.dirname(storageKey)), { recursive: true });
  await fs.writeFile(path.join(config.uploadDir, storageKey), file.buffer);
  const asset = await MediaAsset.create({
    originalName: file.originalname.slice(0, 200),
    storageKey,
    mimeType: file.mimetype,
    size: file.size,
    kind: meta.kind,
    uploadedBy: req.user!._id,
    inheritAccess: inheritAccess === "true",
    access: { visibility },
  });
  await audit(req, "media.upload", "MediaAsset", asset._id, `Uploaded ${asset.originalName}`);
  res.status(201).json({ ...asset.toObject(), url: `/api/media/${asset._id}/file` });
});

adminMediaRouter.patch("/:id", async (req, res) => {
  const data = parse(z.object({ inheritAccess: z.boolean(), access: accessInput }), req.body);
  const asset = await MediaAsset.findByIdAndUpdate(oid(String(req.params.id)), data, { returnDocument: "after" });
  if (!asset) throw notFound("File");
  await audit(req, "media.update", "MediaAsset", asset._id, `Changed access for ${asset.originalName}`);
  res.json(asset);
});

adminMediaRouter.delete("/:id", requirePermission(PERMISSIONS.contentManage), async (req, res) => {
  const asset = await MediaAsset.findById(oid(String(req.params.id)));
  if (!asset) throw notFound("File");
  if (asset.linked.length) throw new HttpError(409, "This file is used by published items. Remove it from those items first.");
  await fs.rm(path.join(config.uploadDir, asset.storageKey), { force: true });
  await asset.deleteOne();
  await audit(req, "media.delete", "MediaAsset", asset._id, `Deleted ${asset.originalName}`);
  res.json({ ok: true });
});
