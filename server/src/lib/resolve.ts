import type { AuthUser } from "../middleware/auth.js";
import type { Block } from "../models/common.js";
import { Content, MediaAsset } from "../models/content.js";
import { FeedbackForm } from "../models/feedback.js";
import { visibleFilter } from "./access.js";
import { isId } from "./http.js";

export const CARD_FIELDS =
  "type title slug summary featuredImage categories tags status publishAt publishedAt expireAt featured access.visibility opportunity.opportunityType opportunity.organizationName opportunity.location opportunity.workMode opportunity.deadline opportunity.employmentType knowledge portfolio author createdAt updatedAt";

/** Public shape of a feedback form (no history, no creator). */
export function publicForm(form: {
  _id: unknown;
  title: string;
  description?: string | null;
  questions: unknown[];
  anonymity: string;
  submissionPolicy: string;
  version: number;
}) {
  return {
    _id: form._id,
    title: form.title,
    description: form.description,
    questions: form.questions,
    anonymity: form.anonymity,
    submissionPolicy: form.submissionPolicy,
    version: form.version,
  };
}

/**
 * Expand blocks for rendering: related-content blocks only resolve items the viewer may
 * see, file blocks get metadata, feedback blocks get their form definition.
 */
export async function resolveBlocks(blocks: Block[], user?: AuthUser) {
  const relatedIds = blocks.flatMap((b) => (b.type === "related" ? (b.data.contentIds as string[]) : []));
  const mediaIds = blocks.flatMap((b) => (b.type === "file" && isId(b.data.mediaId) ? [b.data.mediaId as string] : []));
  const formIds = blocks.flatMap((b) => (b.type === "feedback" && isId(b.data.formId) ? [b.data.formId as string] : []));

  const [related, media, forms] = await Promise.all([
    relatedIds.length
      ? Content.find({ _id: { $in: relatedIds }, ...visibleFilter(user) }).select(CARD_FIELDS).lean()
      : [],
    mediaIds.length ? MediaAsset.find({ _id: { $in: mediaIds } }).select("originalName size mimeType kind").lean() : [],
    formIds.length ? FeedbackForm.find({ _id: { $in: formIds }, status: "active" }).lean() : [],
  ]);
  const relatedMap = new Map(related.map((r) => [String(r._id), r]));
  const mediaMap = new Map(media.map((m) => [String(m._id), m]));
  const formMap = new Map(forms.map((f) => [String(f._id), publicForm(f)]));

  return blocks.map((b) => {
    if (b.type === "related") {
      return { ...b, data: { ...b.data, items: (b.data.contentIds as string[]).map((id) => relatedMap.get(id)).filter(Boolean) } };
    }
    if (b.type === "file" && b.data.mediaId) {
      const m = mediaMap.get(String(b.data.mediaId));
      return { ...b, data: { ...b.data, file: m ? { name: m.originalName, size: m.size, mimeType: m.mimeType, url: `/api/media/${m._id}/file` } : null } };
    }
    if (b.type === "feedback") {
      return { ...b, data: { ...b.data, form: formMap.get(String(b.data.formId)) ?? null } };
    }
    return b;
  });
}
