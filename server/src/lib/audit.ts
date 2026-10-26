import type { Request } from "express";
import type { Types } from "mongoose";
import { AuditLog } from "../models/admin.js";

const SECRET_KEYS = /password|token|secret|hash/i;

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !SECRET_KEYS.test(k))
        .map(([k, v]) => [k, scrub(v)]),
    );
  }
  return value;
}

export async function audit(
  req: Request,
  action: string,
  entityType: string,
  entityId?: Types.ObjectId | string | null,
  summary?: string,
  meta?: Record<string, unknown>,
) {
  try {
    await AuditLog.create({
      actor: req.user?._id,
      actorEmail: req.user?.email,
      action,
      entityType,
      entityId: entityId ?? undefined,
      summary,
      meta: meta ? scrub(meta) : undefined,
      ip: req.ip,
    });
  } catch (err) {
    console.error("Audit log write failed", err);
  }
}
