import type { Types } from "mongoose";
import { z } from "zod";
import { can, type AuthUser } from "../middleware/auth.js";
import { PUBLICATION_STATUSES, VISIBILITIES, type PublicationStatus } from "../models/common.js";
import { MediaAsset } from "../models/content.js";
import { STATUS_FEATURE, isFeatureOn } from "./features.js";
import { HttpError, forbidden, isId } from "./http.js";
import { PERMISSIONS } from "./permissions.js";

export const accessInput = z
  .object({
    visibility: z.enum(VISIBILITIES),
    roles: z.array(z.string().refine(isId)).max(50).default([]),
    organizations: z.array(z.string().refine(isId)).max(200).default([]),
  })
  .refine((a) => a.visibility !== "roles" || a.roles.length > 0, { message: "Select at least one role", path: ["roles"] })
  .refine((a) => a.visibility !== "organizations" || a.organizations.length > 0, {
    message: "Select at least one organization",
    path: ["organizations"],
  });

export const dateInput = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : v === null ? null : undefined))
  .refine((d) => d === undefined || d === null || !Number.isNaN(d.getTime()), "Invalid date");

const EDITOR_STATUSES: PublicationStatus[] = ["draft", "pending_review"];

interface PublishTarget {
  isNew?: boolean;
  status?: string | null;
  publishAt?: Date | null;
  publishedAt?: Date | null;
}

/**
 * Apply a requested status change, enforcing the publishing workflow: editors without
 * `content.publish` can only save drafts or submit for review, and statuses whose
 * publishing feature the developer console has switched off can't be chosen.
 */
export async function applyStatus(doc: PublishTarget, requested: string | undefined, user: AuthUser) {
  const target = requested ?? doc.status ?? "";
  if ((doc.isNew || target !== doc.status) && STATUS_FEATURE[target] && !(await isFeatureOn(STATUS_FEATURE[target], user))) {
    throw new HttpError(400, `The ${target.replace("_", " ")} status is not available`, { status: "This status is switched off" });
  }
  if (!requested || requested === doc.status) {
    if (doc.status === "published" && !doc.publishedAt) doc.publishedAt = new Date();
    return;
  }
  if (!(PUBLICATION_STATUSES as readonly string[]).includes(requested)) throw new HttpError(400, "Unknown status");
  const status = requested as PublicationStatus;
  if (!EDITOR_STATUSES.includes(status) && !can(user, PERMISSIONS.contentPublish)) {
    throw forbidden("You can save drafts or submit for review, but publishing requires approval rights");
  }
  if (status === "scheduled" && (!doc.publishAt || doc.publishAt <= new Date())) {
    throw new HttpError(400, "Scheduled items need a future publish date", { publishAt: "Choose a future date" });
  }
  doc.status = status;
  if (status === "published") doc.publishedAt = doc.publishedAt ?? new Date();
  if (status === "scheduled") doc.publishedAt = doc.publishAt ?? null;
}

/**
 * Drop editor fields whose publishing feature is switched off, so a stale editor can't set
 * them: publish dates (scheduling), expiry dates, SEO and homepage featuring.
 */
export async function dropDisabledFields<T extends { publishAt?: unknown; expireAt?: unknown; seo?: unknown; featured?: unknown }>(data: T, user: AuthUser) {
  if (!(await isFeatureOn("publishing.scheduled", user))) delete data.publishAt;
  if (!(await isFeatureOn("publishing.expiry", user))) delete data.expireAt;
  if (!(await isFeatureOn("publishing.seo", user))) delete data.seo;
  if (!(await isFeatureOn("publishing.featured", user))) delete data.featured;
  return data;
}

/** Record which items reference which media assets so file access can follow item access. */
export async function syncMediaLinks(kind: "content" | "course" | "event", id: Types.ObjectId, mediaIds: string[]) {
  await MediaAsset.updateMany({ "linked.id": id, _id: { $nin: mediaIds } }, { $pull: { linked: { id } } });
  if (mediaIds.length) {
    await MediaAsset.updateMany(
      { _id: { $in: mediaIds }, "linked.id": { $ne: id } },
      { $push: { linked: { kind, id } } },
    );
  }
}

/** Extract `/api/media/<id>/file` references from free-form URLs like featured images. */
export function mediaIdFromUrl(url?: string | null): string | null {
  const m = url?.match(/\/api\/media\/([a-f0-9]{24})\/file/);
  return m?.[1] ?? null;
}
