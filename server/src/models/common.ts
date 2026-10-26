import { Schema, type Types } from "mongoose";

export const VISIBILITIES = ["public", "authenticated", "roles", "organizations", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const PUBLICATION_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "scheduled",
  "published",
  "unpublished",
  "archived",
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export interface AccessRule {
  visibility: Visibility;
  roles: Types.ObjectId[];
  organizations: Types.ObjectId[];
}

/** Embedded access rule shared by contents, courses, events and media. */
export const accessSchema = new Schema<AccessRule>(
  {
    visibility: { type: String, enum: VISIBILITIES, default: "public", required: true },
    roles: [{ type: Schema.Types.ObjectId, ref: "Role" }],
    organizations: [{ type: Schema.Types.ObjectId, ref: "Organization" }],
  },
  { _id: false },
);

export const BLOCK_TYPES = [
  "heading",
  "richText",
  "image",
  "gallery",
  "video",
  "file",
  "columns",
  "cards",
  "list",
  "table",
  "faq",
  "callout",
  "cta",
  "quote",
  "divider",
  "related",
  "feedback",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface Block {
  id: string;
  type: BlockType;
  data: Record<string, unknown>;
}

/** Content blocks are embedded: always read together with their parent. */
export const blockSchema = new Schema<Block>(
  {
    id: { type: String, required: true },
    type: { type: String, enum: BLOCK_TYPES, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false, minimize: false },
);

export const seoSchema = new Schema(
  {
    title: String,
    description: String,
    noIndex: { type: Boolean, default: false },
  },
  { _id: false },
);
