import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Types } from "mongoose";
import { config } from "../config.js";
import { HttpError, forbidden } from "../lib/http.js";
import { ALL_PERMISSIONS, type Permission } from "../lib/permissions.js";
import { Role, User } from "../models/identity.js";

export interface AuthUser {
  id: string;
  _id: Types.ObjectId;
  email: string;
  name: string;
  category: string;
  accountType: string;
  status: string;
  organization?: Types.ObjectId | null;
  roleIds: Types.ObjectId[];
  roleNames: string[];
  permissions: Set<Permission>;
  isDeveloper: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface SessionPayload {
  sub: string;
  tv: number;
}

export function issueSession(res: Response, userId: string, tokenVersion: number, remember: boolean) {
  const days = remember ? config.rememberDays : config.sessionDays;
  const token = jwt.sign({ sub: userId, tv: tokenVersion } satisfies SessionPayload, config.jwtSecret, {
    expiresIn: `${days}d`,
  });
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    maxAge: days * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSession(res: Response) {
  res.clearCookie(config.cookieName, { path: "/" });
}

/** Resolve a session token to the current user, or null when it is invalid, revoked or the account is not active. */
export async function sessionUser(token: string): Promise<AuthUser | null> {
  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as SessionPayload;
  } catch {
    return null;
  }
  const user = await User.findById(payload.sub).lean();
  if (!user || user.tokenVersion !== payload.tv || user.status !== "active") return null;
  const roles = await Role.find({ _id: { $in: user.roles } }).lean();
  return {
    id: String(user._id),
    _id: user._id,
    email: user.email,
    name: user.name,
    category: user.category,
    accountType: user.accountType,
    status: user.status,
    organization: user.organization ?? null,
    roleIds: roles.map((r) => r._id),
    roleNames: roles.map((r) => r.name),
    permissions: user.isDeveloper ? new Set(ALL_PERMISSIONS) : new Set(roles.flatMap((r) => r.permissions as Permission[])),
    isDeveloper: !!user.isDeveloper,
  };
}

/**
 * Resolves the session cookie on every request. Account status and roles are read
 * fresh from the database so suspensions and role changes take effect immediately.
 */
export async function loadUser(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[config.cookieName] as string | undefined;
  if (!token) return next();
  const user = await sessionUser(token);
  if (!user) clearSession(res);
  else req.user = user;
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new HttpError(401, "Please sign in to continue");
  next();
}

export function can(user: AuthUser | undefined, permission: Permission) {
  return !!user?.permissions.has(permission);
}

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, "Please sign in to continue");
    if (!permissions.every((p) => req.user!.permissions.has(p))) throw forbidden();
    next();
  };
}

/** Developer console only; developer accounts are flagged on the user, not granted by a role. */
export function requireDeveloper(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new HttpError(401, "Please sign in to continue");
  if (!req.user.isDeveloper) throw new HttpError(404, "Endpoint not found");
  next();
}
