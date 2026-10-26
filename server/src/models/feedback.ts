import { Schema, model } from "mongoose";

export const QUESTION_TYPES = [
  "rating",
  "nps",
  "single_choice",
  "multiple_choice",
  "yes_no",
  "short_text",
  "long_text",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

const questionSchema = new Schema({
  type: { type: String, enum: QUESTION_TYPES, required: true },
  label: { type: String, required: true, maxlength: 300 },
  help: String,
  required: { type: Boolean, default: false },
  options: [{ label: { type: String, required: true } }],
  /** Upper bound for rating questions (e.g. 5 stars). */
  scaleMax: { type: Number, default: 5, min: 2, max: 10 },
  maxLength: { type: Number, default: 2000 },
});

const formVersionSchema = new Schema(
  {
    version: Number,
    questions: [questionSchema],
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const feedbackFormSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: String,
    questions: { type: [questionSchema], default: [] },
    /** Bumped whenever questions change; earlier question sets are kept in `history`. */
    version: { type: Number, default: 1 },
    history: { type: [formVersionSchema], default: [] },
    anonymity: { type: String, enum: ["identified", "anonymous", "optional"], default: "identified" },
    submissionPolicy: { type: String, enum: ["once", "multiple"], default: "once" },
    status: { type: String, enum: ["draft", "active", "closed"], default: "active" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
export const FeedbackForm = model("FeedbackForm", feedbackFormSchema, "feedbackForms");

const answerSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    /** Label and type snapshot so old submissions keep their meaning after edits. */
    label: String,
    type: { type: String, enum: QUESTION_TYPES },
    value: Schema.Types.Mixed,
  },
  { _id: false },
);

const feedbackSubmissionSchema = new Schema({
  form: { type: Schema.Types.ObjectId, ref: "FeedbackForm", required: true },
  formVersion: { type: Number, required: true },
  targetKind: { type: String, enum: ["content", "course", "lesson", "event"], required: true },
  /** Denormalised for listings; the reference fields are the source of truth. */
  targetType: String,
  targetTitle: String,
  content: { type: Schema.Types.ObjectId, ref: "Content" },
  course: { type: Schema.Types.ObjectId, ref: "Course" },
  lessonId: Schema.Types.ObjectId,
  event: { type: Schema.Types.ObjectId, ref: "Event" },
  /** Null for anonymous submissions. */
  user: { type: Schema.Types.ObjectId, ref: "User" },
  respondentCategory: String,
  respondentRoles: [{ type: Schema.Types.ObjectId, ref: "Role" }],
  anonymous: { type: Boolean, default: false },
  /** Keyed hash used only to enforce one-response-per-user on anonymous forms. */
  dedupeKey: { type: String, select: false },
  answers: [answerSchema],
  ratingAvg: Number,
  submittedAt: { type: Date, default: Date.now },
});
feedbackSubmissionSchema.index({ form: 1, submittedAt: -1 });
feedbackSubmissionSchema.index({ content: 1, submittedAt: -1 });
feedbackSubmissionSchema.index({ course: 1, lessonId: 1 });
feedbackSubmissionSchema.index({ event: 1 });
feedbackSubmissionSchema.index({ user: 1, submittedAt: -1 });
feedbackSubmissionSchema.index({ dedupeKey: 1 }, { sparse: true });
export const FeedbackSubmission = model("FeedbackSubmission", feedbackSubmissionSchema, "feedbackSubmissions");
