import type { Types } from "mongoose";
import { can, type AuthUser } from "../middleware/auth.js";
import type { AccessRule } from "../models/common.js";
import type { Filter } from "./http.js";
import { PERMISSIONS } from "./permissions.js";

interface Publishable {
  status?: string | null;
  publishAt?: Date | null;
  expireAt?: Date | null;
  access?: Partial<AccessRule> | null;
}

/** Content managers may preview anything regardless of status or audience. */
export const isContentManager = (user?: AuthUser) => can(user, PERMISSIONS.contentManage);

/** Mongo filter matching items that are currently live (published or due-scheduled, not expired). */
export function liveFilter(now = new Date()): Filter {
  return {
    $and: [
      {
        $or: [
          { status: "published", $or: [{ publishAt: null }, { publishAt: { $lte: now } }] },
          { status: "scheduled", publishAt: { $lte: now } },
        ],
      },
      { $or: [{ expireAt: null }, { expireAt: { $gt: now } }] },
    ],
  };
}

/** Mongo filter for audiences the given viewer belongs to. */
export function audienceFilter(user?: AuthUser): Filter {
  const or: Filter[] = [{ "access.visibility": "public" }];
  if (user) {
    or.push({ "access.visibility": "authenticated" });
    if (user.roleIds.length) or.push({ "access.visibility": "roles", "access.roles": { $in: user.roleIds } });
    if (user.organization)
      or.push({ "access.visibility": "organizations", "access.organizations": user.organization });
  }
  return { $or: or };
}

/** Combined filter used by every public listing, search, featured and related query. */
export function visibleFilter(user?: AuthUser): Filter {
  return { $and: [liveFilter(), audienceFilter(user)] };
}

export function isLive(item: Publishable, now = new Date()) {
  const publishOk =
    (item.status === "published" && (!item.publishAt || item.publishAt <= now)) ||
    (item.status === "scheduled" && !!item.publishAt && item.publishAt <= now);
  return publishOk && (!item.expireAt || item.expireAt > now);
}

export function inAudience(access: Partial<AccessRule> | null | undefined, user?: AuthUser) {
  const visibility = access?.visibility ?? "public";
  if (visibility === "public") return true;
  if (!user) return false;
  if (visibility === "authenticated") return true;
  if (visibility === "roles") {
    const allowed = new Set((access?.roles ?? []).map(String));
    return user.roleIds.some((r) => allowed.has(String(r)));
  }
  if (visibility === "organizations") {
    return !!user.organization && (access?.organizations ?? []).some((o) => String(o) === String(user.organization));
  }
  return false;
}

export function canView(item: Publishable, user?: AuthUser) {
  if (isContentManager(user)) return true;
  return isLive(item) && inAudience(item.access, user);
}

/** Short label for UI access badges. */
export function accessLabel(access?: Partial<AccessRule> | null) {
  return access?.visibility ?? "public";
}

export type IdLike = Types.ObjectId | string;
