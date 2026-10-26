import { Schema, model } from "mongoose";
import { PUBLICATION_STATUSES, accessSchema, blockSchema } from "./common.js";

const lessonSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    summary: String,
    durationMinutes: Number,
    blocks: { type: [blockSchema], default: [] },
    feedbackForm: { type: Schema.Types.ObjectId, ref: "FeedbackForm" },
  },
  { minimize: false },
);

const moduleSchema = new Schema({
  title: { type: String, required: true, trim: true },
  summary: String,
  lessons: { type: [lessonSchema], default: [] },
});

const courseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true },
    summary: { type: String, maxlength: 600, default: "" },
    description: { type: String, default: "" },
    thumbnail: String,
    level: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "beginner" },
    objectives: [String],
    modules: { type: [moduleSchema], default: [] },
    categories: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    linkedContent: [{ type: Schema.Types.ObjectId, ref: "Content" }],
    author: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: PUBLICATION_STATUSES, default: "draft" },
    publishAt: Date,
    expireAt: Date,
    publishedAt: Date,
    access: { type: accessSchema, default: () => ({ visibility: "authenticated" }) },
    feedbackForm: { type: Schema.Types.ObjectId, ref: "FeedbackForm" },
    trackCompletion: { type: Boolean, default: true },
  },
  { timestamps: true, minimize: false },
);
courseSchema.index({ status: 1, publishedAt: -1 });
export const Course = model("Course", courseSchema, "courses");

const enrollmentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    status: { type: String, enum: ["active", "completed", "withdrawn"], default: "active" },
    completedLessons: [Schema.Types.ObjectId],
    progress: { type: Number, default: 0, min: 0, max: 100 },
    enrolledAt: { type: Date, default: Date.now },
    completedAt: Date,
  },
  { timestamps: true },
);
enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ course: 1 });
export const Enrollment = model("Enrollment", enrollmentSchema, "enrollments");

export const EVENT_TYPES = ["summit", "webinar", "conference", "workshop", "industry_visit", "meeting", "program"] as const;

const eventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true },
    summary: { type: String, maxlength: 600, default: "" },
    eventType: { type: String, enum: EVENT_TYPES, required: true },
    startAt: { type: Date, required: true },
    endAt: Date,
    location: {
      mode: { type: String, enum: ["in_person", "online", "hybrid"], default: "in_person" },
      venue: String,
      city: String,
      /** Meeting link is only returned to users permitted to view the event. */
      meetingUrl: String,
    },
    registration: {
      enabled: { type: Boolean, default: false },
      capacity: Number,
      deadline: Date,
      externalUrl: String,
    },
    featuredImage: String,
    blocks: { type: [blockSchema], default: [] },
    categories: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    linkedContent: [{ type: Schema.Types.ObjectId, ref: "Content" }],
    author: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: PUBLICATION_STATUSES, default: "draft" },
    publishAt: Date,
    expireAt: Date,
    publishedAt: Date,
    access: { type: accessSchema, default: () => ({ visibility: "public" }) },
    feedbackForm: { type: Schema.Types.ObjectId, ref: "FeedbackForm" },
  },
  { timestamps: true, minimize: false },
);
eventSchema.index({ startAt: 1 });
eventSchema.index({ status: 1, eventType: 1, startAt: 1 });
export const Event = model("Event", eventSchema, "events");

const eventRegistrationSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["registered", "cancelled", "attended"], default: "registered" },
  },
  { timestamps: true },
);
eventRegistrationSchema.index({ event: 1, user: 1 }, { unique: true });
export const EventRegistration = model("EventRegistration", eventRegistrationSchema, "eventRegistrations");

export const EXPERT_TYPES = ["industry_expert", "research_expert", "trainer", "consultant", "mentor"] as const;

const expertSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    headline: { type: String, required: true, maxlength: 160 },
    bio: { type: String, maxlength: 4000, default: "" },
    expertType: { type: String, enum: EXPERT_TYPES, required: true },
    domain: String,
    skills: [String],
    expertiseAreas: [String],
    yearsExperience: Number,
    location: String,
    photoUrl: String,
    /** public: anyone; members: signed-in members only; hidden: admins only. */
    visibility: { type: String, enum: ["public", "members", "hidden"], default: "members" },
    /** Member consented to their email being shown to signed-in members. */
    shareEmail: { type: Boolean, default: false },
    mentoringAvailable: { type: Boolean, default: false },
    status: { type: String, enum: ["pending", "approved", "inactive"], default: "pending" },
  },
  { timestamps: true },
);
expertSchema.index({ expertType: 1, status: 1, visibility: 1 });
expertSchema.index({ skills: 1 });
expertSchema.index({ headline: "text", bio: "text", skills: "text", expertiseAreas: "text" });
export const Expert = model("Expert", expertSchema, "experts");
