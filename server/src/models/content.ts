import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { PUBLICATION_STATUSES, accessSchema, blockSchema, seoSchema } from "./common.js";

export const CONTENT_TYPES = [
  "page",
  "project",
  "case_study",
  "service",
  "opportunity",
  "article",
  "blog",
  "tutorial",
  "announcement",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const OPPORTUNITY_TYPES = [
  "hiring",
  "internship",
  "consultancy",
  "research_collaboration",
  "technology_transfer",
  "training",
  "funding",
] as const;

export const KNOWLEDGE_SECTIONS = [
  "industry_insights",
  "research_repository",
  "regulatory_corner",
  "learning_center",
  "funding_opportunities",
  "innovation_center",
  "templates_downloads",
  "success_stories",
] as const;

const contentSchema = new Schema(
  {
    type: { type: String, enum: CONTENT_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, trim: true },
    summary: { type: String, maxlength: 600, default: "" },
    featuredImage: String,
    blocks: { type: [blockSchema], default: [] },
    categories: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    tags: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
    author: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: PUBLICATION_STATUSES, default: "draft", required: true },
    publishAt: Date,
    expireAt: Date,
    publishedAt: Date,
    featured: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    seo: { type: seoSchema, default: {} },
    access: { type: accessSchema, default: () => ({ visibility: "public" }) },
    feedbackForm: { type: Schema.Types.ObjectId, ref: "FeedbackForm" },
    opportunity: {
      opportunityType: { type: String, enum: OPPORTUNITY_TYPES },
      organization: { type: Schema.Types.ObjectId, ref: "Organization" },
      organizationName: String,
      location: String,
      workMode: { type: String, enum: ["onsite", "remote", "hybrid"] },
      employmentType: String,
      deadline: Date,
      applyUrl: String,
      applyEmail: String,
      eligibility: String,
    },
    knowledge: {
      section: { type: String, enum: KNOWLEDGE_SECTIONS },
      readingMinutes: Number,
    },
    portfolio: {
      section: String,
      client: String,
      year: Number,
    },
  },
  { timestamps: true, minimize: false },
);
contentSchema.index({ type: 1, slug: 1 }, { unique: true });
contentSchema.index({ type: 1, status: 1, publishedAt: -1 });
contentSchema.index({ status: 1, publishAt: 1 });
contentSchema.index({ categories: 1 });
contentSchema.index({ tags: 1 });
contentSchema.index({ "opportunity.opportunityType": 1 });
contentSchema.index({ "knowledge.section": 1 });
contentSchema.index({ title: "text", summary: "text" });
export const Content = model("Content", contentSchema, "contents");
export type ContentDoc = HydratedDocument<InferSchemaType<typeof contentSchema>>;

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    description: String,
    contentTypes: [{ type: String, enum: [...CONTENT_TYPES, "course", "event"] }],
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
);
export const Category = model("Category", categorySchema, "categories");

const tagSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    description: String,
  },
  { timestamps: true },
);
export const Tag = model("Tag", tagSchema, "tags");

const mediaAssetSchema = new Schema(
  {
    originalName: { type: String, required: true },
    storageKey: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    kind: { type: String, enum: ["image", "video", "document"], required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
    /**
     * When `inheritAccess` is true and the asset is linked to content, a viewer must be
     * able to view at least one live linked item. Otherwise `access` applies directly.
     */
    inheritAccess: { type: Boolean, default: true },
    access: { type: accessSchema, default: () => ({ visibility: "authenticated" }) },
    linked: [
      {
        _id: false,
        kind: { type: String, enum: ["content", "course", "event"] },
        id: Schema.Types.ObjectId,
      },
    ],
  },
  { timestamps: true },
);
mediaAssetSchema.index({ "linked.id": 1 });
export const MediaAsset = model("MediaAsset", mediaAssetSchema, "mediaAssets");
