import type { NextFunction, Request, Response } from "express";
import { can, type AuthUser } from "../middleware/auth.js";
import { FeatureSetting } from "../models/admin.js";
import { CONTENT_TYPES } from "../models/content.js";
import { HttpError } from "./http.js";
import { MEMBER_CATEGORIES, PERMISSIONS } from "./permissions.js";

/**
 * Screens and features the developer console can switch off or limit to member categories.
 *
 * - `parent`: a feature is off whenever its parent is off (the screen it lives on).
 * - `requires`: other features it depends on; any of them being off turns it off too.
 * - `scope`: who an audience limit applies to. `public` features can be limited for visitors and
 *   each member category, `member` features for member categories only, and `staff` features
 *   (the admin workspace) can only be switched on or off.
 *
 * Staff with admin access ignore audience limits (they manage the content), and developers see
 * everything, but switched-off features are off for staff too.
 */
export type FeatureScope = "public" | "member" | "staff";
export interface FeatureDef {
  key: string;
  label: string;
  description: string;
  group: "Public website" | "Member portal" | "Across the platform" | "Publishing workflow" | "Page builder" | "Admin workspace";
  scope: FeatureScope;
  parent?: string;
  requires?: string[];
}

export const FEATURES: FeatureDef[] = [
  // ------------------------------------------------------------ public website
  { key: "home", group: "Public website", scope: "public", label: "Homepage", description: "Landing page sections. Sections for other screens follow those screens." },
  { key: "home.stats", group: "Public website", scope: "public", parent: "home", label: "Network statistics", description: "Live counts of partners, experts, institutions, opportunities and members" },
  { key: "home.video", group: "Public website", scope: "public", parent: "home", label: "Intro video", description: "The “Watch Video” button in the hero" },
  { key: "portfolio", group: "Public website", scope: "public", label: "About & Company Portfolio", description: "About page, services, projects and case studies" },
  { key: "partners", group: "Public website", scope: "public", label: "Partner Ecosystem", description: "Partner listing by tier" },
  { key: "partners.profiles", group: "Public website", scope: "public", parent: "partners", label: "Partner profiles", description: "Individual partner pages" },
  { key: "partners.enquire", group: "Public website", scope: "public", parent: "partners.profiles", requires: ["contact"], label: "Partnership enquiries", description: "“Enquire about partnership” on partner profiles" },
  { key: "opportunities", group: "Public website", scope: "public", label: "Opportunities Hub", description: "Opportunity listings and detail pages" },
  { key: "opportunities.post", group: "Public website", scope: "member", parent: "opportunities", requires: ["dashboard", "publishing.review"], label: "Post a requirement", description: "Members submit opportunities for review" },
  { key: "opportunities.save", group: "Public website", scope: "member", parent: "opportunities", requires: ["saved"], label: "Save opportunities", description: "Bookmark opportunities to the dashboard" },
  { key: "knowledge", group: "Public website", scope: "public", label: "Knowledge Hub", description: "The Knowledge Hub screen" },
  { key: "knowledge.resources", group: "Public website", scope: "public", parent: "knowledge", label: "Resources", description: "Articles, blogs and tutorials" },
  { key: "knowledge.courses", group: "Public website", scope: "public", parent: "knowledge", label: "Courses", description: "Course catalogue, outlines and lessons" },
  { key: "knowledge.courses.enroll", group: "Public website", scope: "member", parent: "knowledge.courses", requires: ["dashboard"], label: "Enrolment & progress", description: "Enrol in courses and mark lessons complete" },
  { key: "experts", group: "Public website", scope: "public", label: "Experts Network", description: "Expert listing and profiles" },
  { key: "experts.connect", group: "Public website", scope: "member", parent: "experts", requires: ["contact"], label: "Request introductions", description: "“Request to connect” with an expert" },
  { key: "experts.selfProfile", group: "Public website", scope: "member", parent: "experts", requires: ["dashboard"], label: "Expert self-service", description: "Members create and edit their own expert profile" },
  { key: "events", group: "Public website", scope: "public", label: "Events & Announcements", description: "The Events & Announcements screen" },
  { key: "events.calendar", group: "Public website", scope: "public", parent: "events", label: "Events", description: "Event listings and detail pages" },
  { key: "events.registration", group: "Public website", scope: "member", parent: "events.calendar", requires: ["dashboard"], label: "Event registration", description: "Register for events; meeting links for attendees" },
  { key: "events.announcements", group: "Public website", scope: "public", parent: "events", label: "Announcements", description: "News and announcements" },
  { key: "contact", group: "Public website", scope: "public", label: "Contact & Collaboration Center", description: "Contact form and every request to the secretariat" },
  { key: "search", group: "Public website", scope: "public", label: "Site search", description: "Search across all sections" },
  { key: "registration", group: "Public website", scope: "staff", requires: ["admin.approvals"], label: "Membership registration", description: "New members can join (switching off closes registration)" },
  // ------------------------------------------------------------ member portal
  { key: "dashboard", group: "Member portal", scope: "member", label: "Member Portal", description: "The member dashboard and its pages" },
  { key: "saved", group: "Member portal", scope: "member", parent: "dashboard", label: "Saved items", description: "Bookmarks and the Saved page" },
  { key: "dashboard.learning", group: "Member portal", scope: "member", parent: "dashboard", requires: ["knowledge.courses.enroll"], label: "My Learning", description: "Course progress page" },
  { key: "dashboard.events", group: "Member portal", scope: "member", parent: "dashboard", requires: ["events.registration"], label: "My Events", description: "Registered events page" },
  { key: "dashboard.requests", group: "Member portal", scope: "member", parent: "dashboard", requires: ["contact"], label: "Requests & Messages", description: "Requests sent and secretariat replies" },
  { key: "dashboard.companyProfile", group: "Member portal", scope: "member", parent: "dashboard", label: "Company profile", description: "Organisation members edit their organisation's profile" },
  { key: "dashboard.feedback", group: "Member portal", scope: "member", parent: "dashboard", requires: ["feedback"], label: "My Feedback", description: "Feedback the member has submitted" },
  // ------------------------------------------------------------ cross-cutting
  { key: "feedback", group: "Across the platform", scope: "public", label: "Feedback forms", description: "Ratings and feedback on content, courses, lessons and events" },
  { key: "notifications", group: "Across the platform", scope: "member", label: "Notifications", description: "In-app notifications: bell, list and pop-ups" },
  { key: "notifications.live", group: "Across the platform", scope: "member", parent: "notifications", label: "Live delivery", description: "Push notifications instantly instead of on page load" },
  { key: "appearance", group: "Across the platform", scope: "public", label: "Appearance settings", description: "Theme colour and light/dark mode" },
  // ------------------------------------------------------------ publishing workflow (content, courses, events)
  { key: "publishing.drafts", group: "Publishing workflow", scope: "staff", label: "Drafts", description: "Save work in progress as a draft before it goes live" },
  { key: "publishing.review", group: "Publishing workflow", scope: "staff", label: "Review & approval", description: "Pending review and Approved statuses, and member submissions for review" },
  { key: "publishing.scheduled", group: "Publishing workflow", scope: "staff", label: "Scheduled publishing", description: "Publish dates and the Scheduled status: items go live automatically" },
  { key: "publishing.expiry", group: "Publishing workflow", scope: "staff", label: "Expiry dates", description: "Hide items from members automatically after a date" },
  { key: "publishing.unpublish", group: "Publishing workflow", scope: "staff", label: "Unpublish", description: "Take live items offline while keeping them editable" },
  { key: "publishing.archive", group: "Publishing workflow", scope: "staff", label: "Archive", description: "Retire items while keeping their history and feedback" },
  { key: "publishing.preview", group: "Publishing workflow", scope: "staff", label: "Editor preview", description: "The Preview tab in the content editor" },
  { key: "publishing.seo", group: "Publishing workflow", scope: "staff", label: "SEO settings", description: "SEO title, description and search-engine indexing per item" },
  { key: "publishing.featured", group: "Publishing workflow", scope: "staff", requires: ["home"], label: "Homepage featuring", description: "“Feature on the homepage” and featured-first ordering" },
  // ------------------------------------------------------------ page builder blocks
  { key: "blocks.media", group: "Page builder", scope: "public", label: "Media blocks", description: "Image, gallery and video blocks" },
  { key: "blocks.files", group: "Page builder", scope: "public", label: "File downloads", description: "Downloadable file blocks" },
  { key: "blocks.layout", group: "Page builder", scope: "public", label: "Layout blocks", description: "Columns, cards, tables and FAQ accordions" },
  { key: "blocks.cta", group: "Page builder", scope: "public", label: "Call-to-action blocks", description: "Highlighted buttons linking elsewhere" },
  { key: "blocks.related", group: "Page builder", scope: "public", label: "Related content blocks", description: "Lists of related items inside a page" },
  { key: "blocks.feedback", group: "Page builder", scope: "public", requires: ["feedback"], label: "Inline feedback blocks", description: "Feedback forms placed inside a page or lesson" },
  // ------------------------------------------------------------ admin workspace
  { key: "admin.analytics", group: "Admin workspace", scope: "staff", label: "Overview analytics", description: "Statistics and charts on the admin overview" },
  { key: "admin.approvals", group: "Admin workspace", scope: "staff", label: "Member approvals", description: "Approve or reject new registrations" },
  { key: "admin.members", group: "Admin workspace", scope: "staff", label: "Member management", description: "Member list, editing, roles and suspension" },
  { key: "admin.roles", group: "Admin workspace", scope: "staff", label: "Roles & permissions", description: "Create and edit roles" },
  { key: "admin.exports", group: "Admin workspace", scope: "staff", label: "CSV exports", description: "Export members, directories, requests and feedback" },
  { key: "admin.settings", group: "Admin workspace", scope: "staff", label: "Site settings", description: "Homepage hero and secretariat contact details" },
  { key: "admin.portfolio", group: "Admin workspace", scope: "staff", requires: ["portfolio"], label: "Portfolio editor", description: "Manage portfolio pages" },
  { key: "admin.opportunities", group: "Admin workspace", scope: "staff", requires: ["opportunities"], label: "Opportunities editor", description: "Manage opportunities and review submissions" },
  { key: "admin.knowledge", group: "Admin workspace", scope: "staff", requires: ["knowledge.resources"], label: "Knowledge editor", description: "Manage articles, blogs and tutorials" },
  { key: "admin.announcements", group: "Admin workspace", scope: "staff", requires: ["events.announcements"], label: "Announcements editor", description: "Manage announcements" },
  { key: "admin.courses", group: "Admin workspace", scope: "staff", requires: ["knowledge.courses"], label: "Course builder", description: "Courses, modules and lessons" },
  { key: "admin.events", group: "Admin workspace", scope: "staff", requires: ["events.calendar"], label: "Events manager", description: "Create and edit events" },
  { key: "admin.registrations", group: "Admin workspace", scope: "staff", parent: "admin.events", requires: ["events.registration"], label: "Registration lists", description: "Who registered for each event" },
  { key: "admin.feedback", group: "Admin workspace", scope: "staff", requires: ["feedback"], label: "Feedback forms & analytics", description: "Form builder and analytics" },
  { key: "admin.feedback.byMember", group: "Admin workspace", scope: "staff", parent: "admin.feedback", label: "Feedback by member", description: "Identified feedback grouped per member" },
  { key: "admin.requests", group: "Admin workspace", scope: "staff", requires: ["contact"], label: "Requests inbox", description: "Contact, collaboration and expert-connect requests" },
  { key: "admin.requests.notes", group: "Admin workspace", scope: "staff", parent: "admin.requests", label: "Notes & assignment", description: "Internal notes and assigning requests to staff" },
  { key: "admin.requests.reply", group: "Admin workspace", scope: "staff", parent: "admin.requests", requires: ["dashboard.requests"], label: "Replies to members", description: "Replies shown in the member's Requests & Messages" },
  { key: "admin.directory", group: "Admin workspace", scope: "staff", label: "Master Database", description: "Organisation, expert and alumni directories" },
  { key: "admin.experts", group: "Admin workspace", scope: "staff", parent: "admin.directory", requires: ["experts"], label: "Expert directory", description: "Review and edit expert profiles" },
  { key: "admin.alumni", group: "Admin workspace", scope: "staff", parent: "admin.directory", label: "Alumni database", description: "Alumni records in the Master Database" },
  { key: "admin.media", group: "Admin workspace", scope: "staff", label: "Media library", description: "Uploaded files and their access" },
  { key: "admin.taxonomy", group: "Admin workspace", scope: "staff", label: "Categories & tags", description: "Content taxonomy" },
  { key: "admin.audit", group: "Admin workspace", scope: "staff", label: "Audit log", description: "History of changes" },
];

export const FEATURE_KEYS = new Set(FEATURES.map((f) => f.key));
const BY_KEY = new Map(FEATURES.map((f) => [f.key, f]));
export const AUDIENCES = ["visitor", ...MEMBER_CATEGORIES] as const;
export type Audience = (typeof AUDIENCES)[number];

export interface Setting {
  enabled: boolean;
  /** Empty = everyone in scope; otherwise only these audiences. */
  audience: string[];
}
export type FeatureMap = Map<string, Setting>;

/** Why a feature is off for an audience; `key` is the feature whose own setting causes it. */
export interface Resolution {
  on: boolean;
  reason?: "off" | "audience";
  key?: string;
}

/**
 * Resolve a feature for an audience. `audience` null means staff: only on/off settings apply.
 * The chain is followed through parents and requirements, so the first switched-off or
 * audience-limited link explains the result.
 */
export function resolve(map: FeatureMap, key: string, audience: Audience | null, seen = new Set<string>()): Resolution {
  const def = BY_KEY.get(key);
  if (!def || seen.has(key)) return { on: true };
  seen.add(key);
  const s = map.get(key);
  if (s && !s.enabled) return { on: false, reason: "off", key };
  const audienceApplies = audience !== null && def.scope !== "staff" && !(def.scope === "member" && audience === "visitor");
  if (audienceApplies && s?.audience.length && !s.audience.includes(audience)) return { on: false, reason: "audience", key };
  for (const dep of [def.parent, ...(def.requires ?? [])]) {
    if (!dep) continue;
    const r = resolve(map, dep, audience, new Set(seen));
    if (!r.on) return r;
  }
  return { on: true };
}

let cache: { at: number; map: FeatureMap } | null = null;
const TTL_MS = 15_000;

export async function featureMap(): Promise<FeatureMap> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const rows = await FeatureSetting.find().lean();
  const map: FeatureMap = new Map(rows.filter((r) => FEATURE_KEYS.has(r.key)).map((r) => [r.key, { enabled: r.enabled !== false, audience: r.audience ?? [] }]));
  cache = { at: Date.now(), map };
  return map;
}

export function invalidateFeatures() {
  cache = null;
}

/** The audience a request is judged as: null for staff (audience limits don't apply). */
export function audienceOf(user?: AuthUser): Audience | null {
  if (!user) return "visitor";
  if (can(user, PERMISSIONS.adminAccess)) return null;
  return (AUDIENCES as readonly string[]).includes(user.category) ? (user.category as Audience) : "other";
}

export async function isFeatureOn(key: string, user?: AuthUser) {
  if (user?.isDeveloper) return true;
  return resolve(await featureMap(), key, audienceOf(user)).on;
}

/** Every feature's state for this viewer, for the client to hide screens and actions. */
export async function allowedFeatures(user?: AuthUser) {
  const map = await featureMap();
  const audience = audienceOf(user);
  return Object.fromEntries(FEATURES.map((f) => [f.key, user?.isDeveloper ? true : resolve(map, f.key, audience).on]));
}

export const featureOff = () => new HttpError(403, "This feature is not available", { code: "feature_disabled" });

/** Route guard: every listed feature must be on for the requester. */
export function requireFeature(...keys: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    for (const key of keys) if (!(await isFeatureOn(key, req.user))) throw featureOff();
    next();
  };
}

/** Content types and the feature that publishes them. */
export function contentFeature(type: string) {
  if (type === "opportunity") return "opportunities";
  if (type === "announcement") return "events.announcements";
  if (type === "article" || type === "blog" || type === "tutorial") return "knowledge.resources";
  return "portfolio";
}

/** Publication statuses and the feature that offers them; "published" is always available. */
export const STATUS_FEATURE: Record<string, string> = {
  draft: "publishing.drafts",
  pending_review: "publishing.review",
  approved: "publishing.review",
  scheduled: "publishing.scheduled",
  unpublished: "publishing.unpublish",
  archived: "publishing.archive",
};

/** Page-builder block types and the feature that offers them; text blocks are always available. */
export const BLOCK_FEATURE: Record<string, string> = {
  image: "blocks.media",
  gallery: "blocks.media",
  video: "blocks.media",
  file: "blocks.files",
  columns: "blocks.layout",
  cards: "blocks.layout",
  table: "blocks.layout",
  faq: "blocks.layout",
  cta: "blocks.cta",
  related: "blocks.related",
  feedback: "blocks.feedback",
};

/** Content types whose screen is on for this viewer; used to filter listings, search and related items. */
export async function allowedContentTypes(user?: AuthUser) {
  const out: string[] = [];
  for (const type of CONTENT_TYPES) if (await isFeatureOn(contentFeature(type), user)) out.push(type);
  return out;
}
