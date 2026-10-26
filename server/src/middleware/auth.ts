import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Types } from "mongoose";
import { config } from "../config.js";
import { HttpError, forbidden } from "../lib/http.js";
import type { Permission } from "../lib/permissions.js";
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

/**
 * Resolves the session cookie on every request. Account status and roles are read
 * fresh from the database so suspensions and role changes take effect immediately.
 */
export async function loadUser(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[config.cookieName] as string | undefined;
  if (!token) return next();
  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as SessionPayload;
  } catch {
    clearSession(res);
    return next();
  }
  const user = await User.findById(payload.sub).lean();
  if (!user || user.tokenVersion !== payload.tv || user.status !== "active") {
    clearSession(res);
    return next();
  }
  const roles = await Role.find({ _id: { $in: user.roles } }).lean();
  req.user = {
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
    permissions: new Set(roles.flatMap((r) => r.permissions as Permission[])),
  };
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
