import type { Request } from "express";
import mongoose from "mongoose";
import type { ZodType } from "zod";

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`);
export const forbidden = (msg = "You do not have permission to do this") => new HttpError(403, msg);

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    throw new HttpError(400, "Please correct the highlighted fields", fields);
  }
  return result.data;
}

export function pagination(req: Request, defaultLimit = 12, maxLimit = 100) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(req.query.limit) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function paged<T>(items: T[], total: number, page: number, limit: number) {
  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

export function isId(value: unknown): value is string {
  return typeof value === "string" && mongoose.isValidObjectId(value);
}

export function oid(value: string) {
  if (!isId(value)) throw new HttpError(400, "Invalid identifier");
  return new mongoose.Types.ObjectId(value);
}

export function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Escape user text for use in a RegExp search. */
export function searchRegex(q: string) {
  return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 100), "i");
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 80);
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
    // Neutralise spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}

/** Loose Mongo filter type; Mongoose 9's strict filters reject dynamically built queries. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Filter = Record<string, any>;
