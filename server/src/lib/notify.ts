import type { Types } from "mongoose";
import { Notification, NOTIFICATION_KINDS } from "../models/admin.js";
import { Role, User } from "../models/identity.js";
import { PERMISSIONS, type Permission } from "./permissions.js";
import { AUDIENCES, featureMap, resolve, type Audience } from "./features.js";
import { emitToUsers } from "./realtime.js";

type Id = string | Types.ObjectId;
export interface NotificationInput {
  kind: (typeof NOTIFICATION_KINDS)[number];
  title: string;
  body?: string;
  link?: string;
}

/**
 * Store a notification for each user and push it to any open sessions.
 * Failures are logged, never thrown: a notification must not undo the action that caused it.
 */
export async function notify(userIds: Id[], n: NotificationInput, exceptUserId?: Id) {
  const ids = [...new Set(userIds.map(String))].filter((id) => id !== (exceptUserId ? String(exceptUserId) : ""));
  if (!ids.length) return;
  try {
    const recipients = await withFeature(ids, "notifications");
    if (!recipients.length) return;
    const docs = await Notification.insertMany(recipients.map((user) => ({ user, ...n, body: n.body?.slice(0, 500) })));
    const live = new Set(await withFeature(recipients, "notifications.live"));
    for (const doc of docs) if (live.has(String(doc.user))) emitToUsers([String(doc.user)], "notification", doc.toJSON());
  } catch (err) {
    console.error("[notify] failed:", err);
  }
}

/** The users for whom a feature is on, judged the same way as their API requests. */
async function withFeature(ids: string[], key: string) {
  const [map, staffRoles, users] = await Promise.all([
    featureMap(),
    Role.find({ permissions: PERMISSIONS.adminAccess }).select("_id").lean(),
    User.find({ _id: { $in: ids } }).select("category roles isDeveloper").lean(),
  ]);
  const staff = new Set(staffRoles.map((r) => String(r._id)));
  return users
    .filter((u) => u.isDeveloper || resolve(map, key, u.roles.some((r) => staff.has(String(r))) ? null : ((AUDIENCES as readonly string[]).includes(u.category) ? (u.category as Audience) : "other")).on)
    .map((u) => String(u._id));
}

/** Active users holding a permission through any of their roles. */
export async function usersWithPermission(permission: Permission) {
  const roles = await Role.find({ permissions: permission }).select("_id").lean();
  const users = await User.find({ status: "active", roles: { $in: roles.map((r) => r._id) } }).select("_id").lean();
  return users.map((u) => u._id);
}

export async function notifyPermission(permission: Permission, n: NotificationInput, exceptUserId?: Id) {
  await notify(await usersWithPermission(permission), n, exceptUserId);
}

interface Access {
  visibility?: string | null;
  roles?: Id[] | null;
  organizations?: Id[] | null;
}

/** Notify the active members who can see an item with this audience. Public and members-only items reach all members. */
export async function notifyAudience(access: Access | null | undefined, n: NotificationInput, exceptUserId?: Id) {
  const v = access?.visibility ?? "public";
  if (v === "private") return;
  const filter: Record<string, unknown> = { status: "active" };
  if (v === "roles") filter.roles = { $in: access?.roles ?? [] };
  if (v === "organizations") filter.organization = { $in: access?.organizations ?? [] };
  const users = await User.find(filter).select("_id").lean();
  await notify(users.map((u) => u._id), n, exceptUserId);
}

/** Public URL of a content item; mirrors contentHref in client/src/lib/format.ts. */
function contentPath(type: string | null | undefined, slug: string) {
  if (type === "opportunity") return `/opportunities/${slug}`;
  if (type === "announcement") return `/events/announcements/${slug}`;
  if (type === "article" || type === "blog" || type === "tutorial") return `/knowledge/${slug}`;
  return `/portfolio/${slug}`;
}

interface Publishable {
  _id: Types.ObjectId;
  type?: string | null;
  title: string;
  summary?: string | null;
  slug: string;
  status: string;
  author?: Types.ObjectId | null;
  access?: Access | null;
}

/**
 * Called after a content item or event is saved. Asks publishers to review newly submitted items.
 * When an item has just been published, tells a member who submitted it, and alerts its audience
 * for announcements, opportunities and events.
 */
export async function afterStatusChange(item: Publishable, fromStatus: string, actorId: Id, isEvent = false) {
  if (item.status === "pending_review" && fromStatus !== "pending_review") {
    const kind = isEvent ? "Event" : item.type === "opportunity" ? "Opportunity" : "Content";
    await notifyPermission(PERMISSIONS.contentPublish, { kind: "content_review", title: `${kind} to review: ${item.title}`, link: isEvent ? `/admin/events/${item._id}` : `/admin/content/${item._id}` }, actorId);
    return;
  }
  if (item.status !== "published" || fromStatus === "published") return;
  const link = isEvent ? `/events/${item.slug}` : contentPath(item.type, item.slug);
  if (fromStatus === "pending_review" && item.author) {
    await notify([item.author], { kind: "content_published", title: `Your submission "${item.title}" is now live`, link }, actorId);
  }
  if (isEvent || item.type === "announcement" || item.type === "opportunity") {
    const label = isEvent ? "New event" : item.type === "announcement" ? "Announcement" : "New opportunity";
    await notifyAudience(item.access, { kind: isEvent ? "event" : "announcement", title: `${label}: ${item.title}`, body: item.summary ?? undefined, link }, actorId);
  }
}
