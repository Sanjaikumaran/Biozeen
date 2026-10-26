import { Schema, model } from "mongoose";

export const CONTACT_TYPES = [
  "general",
  "collaboration",
  "partnership",
  "expert_connect",
  "requirement",
  "training",
  "support",
] as const;
export const CONTACT_STATUSES = ["new", "in_progress", "responded", "closed"] as const;

const contactRequestSchema = new Schema(
  {
    type: { type: String, enum: CONTACT_TYPES, required: true },
    name: { type: String, required: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, maxlength: 200 },
    phone: String,
    organization: String,
    category: String,
    subject: { type: String, maxlength: 200 },
    message: { type: String, required: true, maxlength: 5000 },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    targetExpert: { type: Schema.Types.ObjectId, ref: "Expert" },
    status: { type: String, enum: CONTACT_STATUSES, default: "new" },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    /** Internal only; never returned to requesters. */
    notes: [
      {
        author: { type: Schema.Types.ObjectId, ref: "User" },
        text: String,
        at: { type: Date, default: Date.now },
      },
    ],
    /** Reply visible to the requesting member in their dashboard. */
    response: String,
    ip: { type: String, select: false },
  },
  { timestamps: true },
);
contactRequestSchema.index({ status: 1, type: 1, createdAt: -1 });
contactRequestSchema.index({ user: 1 });
export const ContactRequest = model("ContactRequest", contactRequestSchema, "contactRequests");

const auditLogSchema = new Schema({
  actor: { type: Schema.Types.ObjectId, ref: "User" },
  actorEmail: String,
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: Schema.Types.ObjectId,
  summary: String,
  meta: Schema.Types.Mixed,
  ip: String,
  at: { type: Date, default: Date.now },
});
auditLogSchema.index({ at: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ actor: 1, at: -1 });
export const AuditLog = model("AuditLog", auditLogSchema, "auditLogs");

const siteSettingsSchema = new Schema(
  {
    key: { type: String, default: "site", unique: true },
    hero: {
      headline: [String],
      highlight: String,
      subheading: String,
      keywords: [String],
      videoUrl: String,
    },
    contact: {
      email: String,
      phone: String,
      address: String,
      ownerLine: String,
      quote: String,
    },
    social: { linkedin: String, twitter: String, youtube: String },
  },
  { timestamps: true },
);
export const SiteSettings = model("SiteSettings", siteSettingsSchema, "siteSettings");
