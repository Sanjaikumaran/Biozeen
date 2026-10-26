# BIAN — Biozeen Industry Academy Network

Company portfolio website and role-based member platform for BIAN, built from the 12-screen website overview and the requirements in [client/Story.md](client/Story.md) and [db/schema.md](db/schema.md). For a screen-by-screen guide to using the platform, see [docs/BIAN-Platform-Guide.md](docs/BIAN-Platform-Guide.md).

| Layer | Stack |
|---|---|
| Client | React 19, Vite, TypeScript, Tailwind CSS 4, React Router 7, Recharts |
| Server | Node.js, Express 5, TypeScript (tsx), Mongoose 9, Zod |
| Database | MongoDB 7 (files on disk, metadata in MongoDB) |

## Getting started

Requirements: Node.js 20+ and a MongoDB instance.

```bash
# 1. API
cd server
cp .env.example .env          # set MONGO_URI and a long random JWT_SECRET
npm install
npm run seed                  # roles, admin account and sample content
npm run dev                   # http://localhost:5000

# 2. Client (second terminal)
cd client
npm install
npm run dev                   # http://localhost:5173 (proxies /api to :5000)
```

`npm run seed -- --reset` drops the database and reseeds.

### Seeded accounts

| Account | Email | Password |
|---|---|---|
| Super administrator | `admin@bian.local` | `BianAdmin2026` |
| Industry member | `industry@demo.bian.local` | `BianDemo2026` |
| Student member | `student@demo.bian.local` | `BianDemo2026` |
| Content editor (drafts only) | `editor@demo.bian.local` | `BianDemo2026` |
| Expert | `priya.sharma@demo.bian.local` | `BianDemo2026` |

Override with `SEED_ADMIN_PASSWORD` / `SEED_DEMO_PASSWORD`. **Change these before any shared deployment.**

### Sample content

Seeded organisations, people, opportunities, events and announcements come from the mock-ups and are placeholders. Portfolio pages (About, services) carry a visible "Placeholder content" notice. Replace all of it with approved BIAN content in **Admin → Content**. The application does not invent company facts, and homepage statistics are counted from the live database.

## Checks

```bash
cd server && npm run typecheck && npm test   # 19 API integration tests (needs MongoDB; uses the bian_test database)
cd client && npm run lint && npm run build
```

The tests cover audience filtering on listings, direct URLs, search, courses and events; editor and publisher rights; HTML sanitising; session revocation on suspension; the registration → verification → approval flow; protected file downloads; upload type checks; anonymous feedback privacy; lesson-level analytics; and identity hiding in feedback reports.

## What's included

**Public site:** homepage, About, Company Portfolio (services, projects, case studies), Partner Ecosystem with partner profiles, Opportunities Hub, Knowledge Hub with courses, Experts Network, Events & Announcements, Contact & Collaboration Center, and site-wide search.

**Accounts:** 3-step registration by category (organisation or individual), email verification, admin approval, login with "remember me", forgot/reset password, change password, and sign out of all devices.

**Member dashboard:** relevant opportunities, learning progress, registered events, requests with secretariat replies, saved items, submitted feedback, profile, company profile for organisation accounts, a self-service expert profile, and "Post a Requirement" (goes to review before publishing).

**Admin workspace:** live statistics and charts; member approvals; members and roles/permissions; Master Database (organisations, experts, alumni) with filters and CSV export; a visual CMS with 17 block types, preview, drafts, review → publish/schedule/expire/archive, and per-item audiences; course builder (modules, lessons, progress tracking); events with registrations; feedback form builder and analytics (by item, course/lesson, member, date, rating, category) with CSV export; contact request handling (status, assignment, internal notes, replies); categories and tags; media library; audit log; and site settings.

## Access model

- **Category** describes a member (startup, academia, industry, SME, alumni, student, professional). **Roles** grant permissions and define audiences. On approval, members get `member` plus the role for their category by default. Admins can change this.
- Every content item, course, event and media file has an audience: public, all members, selected roles, selected organisations, or administrators only. Combined with its publication state (draft, pending review, approved, scheduled, published, unpublished, archived) and publish/expiry dates, this is enforced in the API for listings, detail pages, search, featured and related content, course lessons, feedback submission and file downloads. The UI only reflects these rules.
- Uploaded files are served only through `/api/media/:id/file`. A file follows the access of the live content that uses it, or its own access setting when unused. SVG/HTML uploads are rejected, and image/PDF contents are checked against their declared type.
- Sessions are httpOnly, SameSite=Lax JWT cookies, and the user is re-checked on every request, so suspensions and role changes take effect immediately. Writes from unknown browser origins are rejected. Login, registration, contact and feedback endpoints are rate-limited.
- Rich text is sanitised against an allow-list, and link/media URLs must be http(s) or app-relative.
- Anonymous feedback never stores the user. One-response-per-person on anonymous forms uses a keyed hash. Seeing who submitted identified feedback requires `feedback.viewIdentified`. Editing questions on a form that already has responses creates a new form version, and each answer keeps the question text it was given against.

## Known limitations

- **Email delivery is not wired up.** Verification and password-reset links are written to the server log. In development they also appear on screen. Connect an email provider in `server/src/routes/auth.ts` before production.
- **"Continue with Google"** from the login mock-up is not implemented; it needs OAuth client credentials.
- **Logos** are placeholders: the mock-ups show "LOGO". Partner logos can be set per organisation in the Master Database.
- Quizzes and assessments, multi-factor authentication and real-time messaging are not implemented. Member messaging is handled through secretariat-mediated requests.

## Production notes

- Set `NODE_ENV=production`, a strong `JWT_SECRET`, `CLIENT_ORIGIN`/`APP_URL` set to the public URL, and serve over HTTPS (cookies become `Secure`).
- `npm run build` in `client`, then `npm run build && npm start` in `server`. In production the API also serves `client/dist`.
- Back up both MongoDB and the `UPLOAD_DIR` directory. For multiple servers, move uploads to object storage. The storage key is already separate from the file metadata.
