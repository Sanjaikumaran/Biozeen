# BIAN database reference

This is the MongoDB schema that implements [schema.md](schema.md). The Mongoose models in `server/src/models/` are the source of truth. They define the fields, enum validation and indexes, and `mongoose.syncIndexes()` creates the indexes when the server starts and when the seed runs.

## Collections

| Collection | Model file | Purpose |
|---|---|---|
| `users` | `identity.ts` | Identity, profile, category, roles, status, verification, sessions, saved content, appearance preferences, pending sign-in code (hashed) |
| `roles` | `identity.ts` | Name, display name, permissions, system flag |
| `organizations` | `identity.ts` | Partners and member organisations; public profile and internal contact |
| `contents` | `content.ts` | Central CMS: portfolio pages, services, projects, case studies, opportunities, articles, blogs, tutorials, announcements |
| `categories`, `tags` | `content.ts` | Taxonomy |
| `mediaAssets` | `content.ts` | File metadata, storage key, access, linked items (the files themselves are on disk) |
| `courses` | `learning.ts` | Course with embedded modules and lessons (lesson blocks embedded) |
| `enrollments` | `learning.ts` | User × course progress and completed lessons |
| `events` | `learning.ts` | Events with location, registration settings and blocks |
| `eventRegistrations` | `learning.ts` | User × event registration tracking (optional per the requirements) |
| `experts` | `learning.ts` | Expert profile linked to a user, with an `access` audience chosen by the expert |
| `feedbackForms` | `feedback.ts` | Questions (embedded), version and question history, anonymity and submission rules |
| `feedbackSubmissions` | `feedback.ts` | Answers with a snapshot of each question's text, form version, target references, respondent (identified only) |
| `contactRequests` | `admin.ts` | Contact, partnership, collaboration and expert-connect requests; status, assignee, notes, reply |
| `auditLogs` | `admin.ts` | Actor, action, entity, summary, scrubbed metadata |
| `siteSettings` | `admin.ts` | Homepage hero and secretariat contact (single document) |
| `featureSettings` | `admin.ts` | Developer feature switches: one document per feature key with `enabled` and `audience` (empty = everyone) |
| `notifications` | `admin.ts` | Per-user in-app notifications (kind, title, body, link, read time); expire after 90 days |

## Shared embedded shapes

```js
// access — on contents, courses, events, experts, mediaAssets
{ visibility: "public" | "authenticated" | "roles" | "organizations" | "private",
  roles: [ObjectId<Role>], organizations: [ObjectId<Organization>] }

// block — CMS page builder (contents.blocks, events.blocks, courses.modules.lessons.blocks)
{ id: String, type: "heading" | "richText" | "image" | "gallery" | "video" | "file" | "columns" | "cards"
  | "list" | "table" | "faq" | "callout" | "cta" | "quote" | "divider" | "related" | "feedback",
  data: Mixed }  // sanitised per type on save (server/src/lib/blocks.ts)

// publication — contents, courses, events
status: "draft" | "pending_review" | "approved" | "scheduled" | "published" | "unpublished" | "archived"
publishAt, expireAt, publishedAt: Date
```

An item is **live** when its status is `published` and `publishAt` is unset or past, or its status is `scheduled` and `publishAt` is past, and in both cases `expireAt` is unset or in the future (`server/src/lib/access.ts`).

## Relationships

- `users.roles → roles`, `users.organization → organizations`, `experts.user → users` (unique).
- `contents.categories/tags → categories/tags`, `contents.author → users`, `contents.opportunity.organization → organizations`, `contents.feedbackForm → feedbackForms`. Feedback blocks reference forms by `data.formId`.
- `courses.feedbackForm` and `courses.modules[].lessons[].feedbackForm → feedbackForms`, and `enrollments.{user,course}`.
- `events.feedbackForm → feedbackForms`, and `eventRegistrations.{event,user}`.
- `feedbackSubmissions.form → feedbackForms` plus exactly one target: `content`, `event`, `course`, or `course` + `lessonId`. Submissions are a separate, growing collection and are never embedded in content.
- `mediaAssets.linked[] = { kind, id }` is kept in sync when items are saved and drives file access.
- `contactRequests.user → users` (when signed in), `targetExpert → experts`, `assignedTo` and `notes.author → users`.
- `auditLogs.actor → users`.

## Indexes

| Collection | Index |
|---|---|
| users | `email` unique · `{category, status}` · `status` · `createdAt` · text `{name, email}` |
| roles | `name` unique |
| organizations | `slug` unique · `{partnerTier, visibility, status}` · text `{name, description}` |
| contents | `{type, slug}` unique · `{type, status, publishedAt}` · `{status, publishAt}` · `categories` · `tags` · `opportunity.opportunityType` · `knowledge.section` · text `{title, summary}` |
| categories / tags | `slug` unique |
| mediaAssets | `storageKey` unique · `linked.id` |
| courses | `slug` unique · `{status, publishedAt}` |
| enrollments | `{user, course}` unique · `course` |
| events | `slug` unique · `startAt` · `{status, eventType, startAt}` |
| eventRegistrations | `{event, user}` unique |
| experts | `user` unique · `{expertType, status, access.visibility}` · `skills` · text `{headline, bio, skills, expertiseAreas}` |
| feedbackSubmissions | `{form, submittedAt}` · `{content, submittedAt}` · `{course, lessonId}` · `event` · `{user, submittedAt}` · `dedupeKey` (sparse) |
| contactRequests | `{status, type, createdAt}` · `user` |
| auditLogs | `at` · `{entityType, entityId}` · `{actor, at}` |
| featureSettings | `key` unique |
| notifications | `{user, createdAt}` · `{user, readAt}` · TTL on `createdAt` (90 days) |

## Privacy and retention

- `passwordHash`, verification and reset token hashes are `select: false`. Tokens are stored only as SHA-256 hashes.
- Organisation `contact` is never returned by public endpoints. Expert email is shown only to signed-in members when the expert has opted in (`shareEmail`).
- Anonymous feedback stores no `user`, roles or category. `dedupeKey` is an HMAC used only to enforce one response per person.
- Audit metadata is scrubbed of any key matching password/token/secret/hash.
- Forms with responses cannot be deleted; close them instead. Organisations with linked members cannot be deleted; mark them inactive. Media used by content cannot be deleted.

## Moving data between machines

[`data/`](data/) holds an export of the database: one Extended JSON file per collection, a `manifest.json` with document counts, and `uploads/` for stored files. Notifications are not exported.

```bash
cd server
npm run db:export               # write the current database to db/data
npm run db:import               # load db/data into an empty database
npm run db:import -- --replace  # drop the database first, then load
```

The server also loads `db/data` automatically when it starts against an empty database (`AUTO_INIT_DB=true`). The export includes password hashes, so keep production data out of it.
