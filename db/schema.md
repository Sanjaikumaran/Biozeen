## MongoDB Database Schema Requirements

Design the MongoDB database schema for the complete BIAN company portfolio and member platform. Define the collections, document structures, field names, data types, references, embedded documents, validation rules, and indexes required for the application.

Create the following collections:

1. **users** — User identity, profile details, email, password hash or identity-provider reference, organization reference, assigned role IDs, account status, verification status, and timestamps.

2. **roles** — Role name, display name, description, permissions, system-role flag, and timestamps.

3. **organizations** — Company and academic institution details, organization type, description, logo reference, website, contact information, collaboration areas, visibility, and status.

4. **contents** — Central CMS collection for company portfolio pages, projects, case studies, opportunities, knowledge articles, tutorials, and announcements. Include content type, title, slug, summary, featured image, dynamic content blocks, metadata, category and tag references, author reference, publication status, scheduling dates, SEO information, role-based access configuration, feedback form references, and timestamps.

5. **categories** — Category name, description, applicable content types, slug, and status.

6. **tags** — Tag name, slug, description, and timestamps.

7. **mediaAssets** — Uploaded image, video, and document metadata, original filename, storage key, MIME type, file size, uploader reference, access classification, and timestamps. Store file metadata in MongoDB and use suitable file or object storage for actual files.

8. **courses** — Course title, description, thumbnail, learning objectives, module and lesson references or embedded structures, linked CMS content, assigned roles, publication status, and timestamps.

9. **enrollments** — User reference, course reference, enrollment status, completion percentage, completed lesson references, enrollment date, completion date, and timestamps.

10. **events** — Event title, description, event type, start and end dates, location or online meeting information, registration details, linked content, role-based access, publication status, and timestamps.

11. **experts** — User reference, biography, headline, skills, expertise areas, profile visibility, mentoring availability, and timestamps.

12. **feedbackForms** — Form title, description, associated content references, configurable questions, question types, answer options, validation settings, required flags, anonymous submission settings, multiple-submission settings, creator reference, form status, and timestamps.

13. **feedbackSubmissions** — Feedback form reference, content reference, course or lesson reference where applicable, user reference when identified, answers, anonymous-submission flag, submission timestamp, and form-version reference.

14. **contactRequests** — Request type, name, email, organization, subject, message, assigned administrator, request status, internal notes, and timestamps.

15. **auditLogs** — Actor reference, action, entity type, entity reference, change summary, timestamp, and relevant administrative activity metadata. Never store passwords, authentication tokens, or other secrets in audit logs.

### MongoDB Schema Design Rules

- Use MongoDB `ObjectId` values consistently for document identifiers and references.
- Embed data that is tightly related and normally retrieved together, such as content blocks, feedback questions, and small module structures.
- Use references for independently managed entities and potentially large or frequently growing datasets, such as users, roles, organizations, enrollments, and feedback submissions.
- Do not embed an unlimited number of feedback submissions inside content documents.
- Support flexible CMS block types, including headings, rich text, images, galleries, videos, documents, columns, cards, tables, FAQs, and feedback sections.
- Support public, authenticated-user, role-restricted, and private content visibility.
- Store role access rules explicitly and enforce them through backend authorization.
- Include publication states such as draft, pending review, scheduled, published, unpublished, and archived where appropriate.
- Preserve historical feedback meaning when questions or forms are edited by using form versioning or snapshots.
- Add validation rules for required fields, allowed content types, status values, and feedback question types.
- Define unique indexes for user email, role name, and content slug within its applicable scope.
- Define indexes for content type, publication status, publication date, categories, user-course enrollment, feedback by content, feedback by form, feedback by user, and event dates.
- Use pagination for content listings, users, and feedback records.
- Design the schema to support feedback analysis by user, content item, course, lesson, date range, and member role, while enforcing privacy permissions.
- Avoid duplicating user profiles, role definitions, or full content documents across collections.
- Store uploaded files outside ordinary MongoDB documents unless GridFS is intentionally selected.
- Apply suitable privacy, retention, archival, and access-control policies.

Generate the complete MongoDB schema with representative example documents for every collection, collection validation rules where appropriate, relationship explanations, and MongoDB index creation commands. Ensure the schema supports all 12 website sections, the company portfolio, the visual CMS, role-based content publishing, course management, and feedback analytics.
