import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { ALL_PERMISSIONS, MEMBER_CATEGORIES } from "../lib/permissions.js";

const roleSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9_]+$/ },
    displayName: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    permissions: [{ type: String, enum: ALL_PERMISSIONS }],
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export const Role = model("Role", roleSchema, "roles");
export type RoleDoc = HydratedDocument<InferSchemaType<typeof roleSchema>>;

export const USER_STATUSES = ["pending", "active", "suspended", "inactive", "rejected"] as const;

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 30 },
    accountType: { type: String, enum: ["organization", "individual"], required: true },
    category: { type: String, enum: MEMBER_CATEGORIES, required: true },
    organization: { type: Schema.Types.ObjectId, ref: "Organization" },
    profile: {
      designation: String,
      department: String,
      bio: { type: String, maxlength: 2000 },
      interests: [String],
      location: String,
      linkedin: String,
      graduationYear: Number,
      institution: String,
    },
    roles: [{ type: Schema.Types.ObjectId, ref: "Role" }],
    status: { type: String, enum: USER_STATUSES, default: "pending", index: true },
    emailVerified: { type: Boolean, default: false },
    verifyTokenHash: { type: String, select: false },
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
    /** Incremented to revoke all existing sessions (logout everywhere, password change). */
    tokenVersion: { type: Number, default: 0 },
    savedContents: [{ type: Schema.Types.ObjectId, ref: "Content" }],
    lastLoginAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
  },
  { timestamps: true },
);
userSchema.index({ category: 1, status: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ name: "text", email: "text" });
export const User = model("User", userSchema, "users");
export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true },
    orgType: {
      type: String,
      enum: ["industry", "academia", "startup", "research", "innovation", "government", "other"],
      required: true,
    },
    partnerTier: {
      type: String,
      enum: ["founding", "knowledge", "industry", "innovation", "none"],
      default: "none",
    },
    description: { type: String, maxlength: 3000, default: "" },
    logoUrl: String,
    website: String,
    location: String,
    /** Internal contact details — never returned on public endpoints. */
    contact: { name: String, email: String, phone: String },
    collaborationAreas: [String],
    initiatives: [{ title: String, description: String, year: Number }],
    visibility: { type: String, enum: ["public", "internal"], default: "internal" },
    status: { type: String, enum: ["pending", "approved", "inactive"], default: "pending" },
  },
  { timestamps: true },
);
organizationSchema.index({ partnerTier: 1, visibility: 1, status: 1 });
organizationSchema.index({ name: "text", description: "text" });
export const Organization = model("Organization", organizationSchema, "organizations");
