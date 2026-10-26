import { randomUUID } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { BLOCK_TYPES, type Block } from "../models/common.js";
import { HttpError, isId } from "./http.js";

const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li",
    "h2", "h3", "h4", "blockquote", "code", "pre", "span", "sub", "sup", "hr",
  ],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
  },
};

export const cleanHtml = (html: unknown) => sanitizeHtml(typeof html === "string" ? html : "", RICH_TEXT_OPTIONS);

const plain = (v: unknown, max = 2000) => (typeof v === "string" ? sanitizeHtml(v, { allowedTags: [], allowedAttributes: {} }).slice(0, max) : "");

/** Accept only http(s) URLs or app-relative paths; anything else (javascript:, data:) is dropped. */
export function safeUrl(v: unknown): string {
  if (typeof v !== "string" || !v.trim()) return "";
  const s = v.trim();
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

const idOrEmpty = (v: unknown) => (isId(v) ? v : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, 100) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Normalise and sanitise a single block's data according to its type. */
function cleanBlockData(type: Block["type"], raw: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case "heading":
      return { text: plain(raw.text, 300), level: [2, 3, 4].includes(Number(raw.level)) ? Number(raw.level) : 2 };
    case "richText":
      return { html: cleanHtml(raw.html) };
    case "image":
      return { url: safeUrl(raw.url), mediaId: idOrEmpty(raw.mediaId), alt: plain(raw.alt, 300), caption: plain(raw.caption, 500) };
    case "gallery":
      return {
        images: arr(raw.images).map((i) => {
          const im = obj(i);
          return { url: safeUrl(im.url), mediaId: idOrEmpty(im.mediaId), alt: plain(im.alt, 300) };
        }),
      };
    case "video":
      return { url: safeUrl(raw.url), mediaId: idOrEmpty(raw.mediaId), caption: plain(raw.caption, 500) };
    case "file":
      return { mediaId: idOrEmpty(raw.mediaId), url: safeUrl(raw.url), label: plain(raw.label, 200), description: plain(raw.description, 500) };
    case "columns":
      return { columns: arr(raw.columns).slice(0, 4).map((c) => ({ html: cleanHtml(obj(c).html) })) };
    case "cards":
      return {
        cards: arr(raw.cards).map((c) => {
          const card = obj(c);
          return { title: plain(card.title, 200), text: plain(card.text, 1000), link: safeUrl(card.link), image: safeUrl(card.image) };
        }),
      };
    case "list":
      return { ordered: !!raw.ordered, items: arr(raw.items).map((i) => plain(i, 1000)) };
    case "table":
      return {
        headers: arr(raw.headers).slice(0, 12).map((h) => plain(h, 200)),
        rows: arr(raw.rows).map((r) => arr(r).slice(0, 12).map((c) => plain(c, 1000))),
      };
    case "faq":
      return { items: arr(raw.items).map((i) => ({ q: plain(obj(i).q, 500), a: plain(obj(i).a, 3000) })) };
    case "callout":
      return { tone: ["info", "success", "warning"].includes(String(raw.tone)) ? raw.tone : "info", title: plain(raw.title, 200), text: plain(raw.text, 2000) };
    case "cta":
      return { title: plain(raw.title, 200), text: plain(raw.text, 1000), buttonLabel: plain(raw.buttonLabel, 60), buttonUrl: safeUrl(raw.buttonUrl) };
    case "quote":
      return { text: plain(raw.text, 1000), cite: plain(raw.cite, 200) };
    case "divider":
      return {};
    case "related":
      return { title: plain(raw.title, 200), contentIds: arr(raw.contentIds).filter(isId).slice(0, 12) };
    case "feedback":
      return { formId: idOrEmpty(raw.formId), title: plain(raw.title, 200) };
  }
}

const rawBlock = z.object({
  id: z.string().optional(),
  type: z.enum(BLOCK_TYPES),
  data: z.record(z.string(), z.unknown()).optional(),
});

export function cleanBlocks(input: unknown): Block[] {
  if (input === undefined) return [];
  const parsed = z.array(rawBlock).max(200).safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Invalid content blocks");
  return parsed.data.map((b) => ({
    id: b.id && /^[\w-]{1,64}$/.test(b.id) ? b.id : randomUUID(),
    type: b.type,
    data: cleanBlockData(b.type, b.data ?? {}),
  }));
}

/** Media asset ids referenced by blocks (for access inheritance). */
export function mediaIdsInBlocks(blocks: Block[]): string[] {
  const ids = new Set<string>();
  for (const b of blocks) {
    const d = b.data as Record<string, unknown>;
    if (typeof d.mediaId === "string" && d.mediaId) ids.add(d.mediaId);
    if (b.type === "gallery") for (const i of d.images as { mediaId?: string }[]) if (i.mediaId) ids.add(i.mediaId);
  }
  return [...ids];
}

export const feedbackFormIdsInBlocks = (blocks: Block[]) =>
  blocks.filter((b) => b.type === "feedback" && b.data.formId).map((b) => String(b.data.formId));
