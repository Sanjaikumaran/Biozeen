# BIAN Platform Guide

How the BIAN website and member platform maps to the 12 screens in the *BIAN Website Overview* design, who can use each part, and how routine tasks are done. For setup and architecture see the [project README](../README.md); for the database see [db/README.md](../db/README.md).

## The 12 screens

| # | Screen | Where it lives | Who uses it |
|---|---|---|---|
| 1 | Homepage | `/` | Everyone |
| 2 | Partner Ecosystem | `/partners`, `/partners/:slug` | Everyone |
| 3 | Membership Registration | `/register` | New visitors |
| 4 | Login | `/login`, `/forgot-password` | Members and administrators |
| 5 | Opportunities & Requirement Hub | `/opportunities` | Everyone; some listings are members-only |
| 6 | Knowledge Hub | `/knowledge`, `/courses/:slug` | Everyone; some resources are members-only |
| 7 | Experts Network | `/experts` | Everyone; connect requests need sign-in |
| 8 | Member Dashboard | `/dashboard` | Signed-in members |
| 9 | Biozeen Admin Dashboard | `/admin` | Administrators |
| 10 | Master Database | `/admin/directory` | Administrators with directory rights |
| 11 | Events & Announcements | `/events` | Everyone; some events are members-only |
| 12 | Contact & Collaboration Center | `/contact` | Everyone |

The portfolio pages the requirements add (About, Company Portfolio) are at `/about` and `/portfolio`.

## Member categories and roles

A **category** describes who someone is. A **role** decides what they can see and do.

| Category (chosen at registration) | Login type | Default roles on approval |
|---|---|---|
| Startups & Innovation Ecosystems | Organisation | Member, Startup & Innovation |
| Academia & Research | Organisation | Member, Academia & Research |
| Industry | Organisation | Member, Industry Member |
| Individual Experts (SME) | Individual | Member, Individual Expert |
| Alumni | Individual | Member, Alumni |
| Student | Individual | Member, Student |
| Professional | Individual | Member, Professional |

Administrators can change a member's roles at any time in **Admin → Members**. The staff roles are:

| Role | Can do |
|---|---|
| Biozeen Administrator | Everything |
| Content Publisher | Create, edit and publish content; build feedback forms; view feedback analytics |
| Content Editor | Create and edit content and submit it for review, but not publish |
| Membership Manager | Approve members; manage organisations, experts and contact requests |

New roles can be created in **Admin → Roles & Permissions** by picking from the permission list.

## Common tasks

### Approve a new member
1. **Admin → Member Approvals** lists pending registrations and whether each email is verified.
2. Click **Approve**, check the suggested roles, then **Approve member**. The member can now sign in.
3. Organisation registrations also create a pending organisation record. Approving the member approves it too, but it stays internal until you make it public in the Master Database.

### Publish an opportunity, article or announcement
1. Open **Admin → Opportunities / Knowledge / Announcements / Portfolio** and click **New**.
2. Fill in the title and summary, then build the page with **Add block**: headings, rich text, images, galleries, videos, file downloads, columns, cards, lists, tables, FAQs, callouts, calls to action, related content and inline feedback forms.
3. Under **Details & SEO**, set type-specific fields (organisation, deadline, apply link, knowledge section…), the featured image and SEO text.
4. Choose the **Audience**: public, all members, selected roles, selected organisations, or administrators only.
5. Set the **Publishing** status. Use *Scheduled* with a publish date to go live automatically, and an expiry date to hide it later.
6. Check the **Preview** tab, then **Save**.

Files attached to a page are only downloadable by people who can see that page.

### Review a member-submitted requirement
Members post requirements from **Dashboard → Post Opportunity**. These arrive as *Pending review* and are counted on the Overview and Approvals pages. Open one, edit it if needed, set the audience and publish.

### Build a course
1. **Admin → Courses → New course.** Add the summary, objectives, thumbnail and audience.
2. Add **modules**, then **lessons**. Clicking a lesson opens the page builder for its content.
3. Optionally attach a course-level and a lesson-level feedback form, then save and publish.

Members enrol from the course page, mark lessons complete, and see their progress on the dashboard.

### Run an event
1. **Admin → Events → New event.** Set the type, dates, format (in person, online, hybrid), venue or meeting link, and registration options (capacity, deadline or an external link).
2. The meeting link is only shown to registered attendees.
3. The **Registrations** tab lists who has signed up. A post-event feedback form appears on the event page once the event starts.

### Collect and review feedback
1. **Admin → Feedback Forms → New form.** Add questions: star rating, 0–10 recommendation, single or multiple choice, yes/no, short or long text. Choose whether responses are identified, anonymous or the respondent's choice, and whether people can respond once or repeatedly.
2. Attach the form to an item through its **Feedback form** setting, or place it inline with a feedback block.
3. **Admin → Feedback Analytics** shows response counts, average rating, trend over time, rating distribution and per-question breakdowns. It can be filtered by date, content type, specific item, form, rating, category and identified/anonymous.
   - **Courses & lessons** compares lessons within a course and flags those rated below 3.
   - **Responses** lists individual answers. Click an item row to drill in.
   - **By member** is available only to roles allowed to see who submitted identified feedback.
   - **Export CSV** downloads the filtered responses.

Anonymous responses never show who submitted them, even to the super administrator.

### Handle contact and collaboration requests
**Admin → Requests** lists every enquiry from the contact form and every expert-connect request. Open one to change its status, assign it to a staff member, add internal notes, or write a reply that the member will see under **Dashboard → Requests & Messages**.

### Maintain the directories
**Admin → Master Database** has tabs for organisations, experts and alumni, each with search, filters and CSV export.
- An organisation shows in the public Partner Ecosystem only when its status is *Approved* and its visibility is *Public partner profile*. Internal contact details are never shown publicly.
- Expert visibility (public, members only, hidden) follows the expert's own choice. Members can create or update their expert profile from **Dashboard → Profile**, and new profiles wait for approval.

### Update homepage and contact details
**Admin → Site Settings** controls the hero text, keywords, the optional intro video ("Watch Video"), and the secretariat email, phone and address shown in the footer and on the Contact page.

## Before launch checklist

- [ ] Replace all seeded sample organisations, experts, listings, events and announcements with approved content.
- [ ] Replace the placeholder text on the About and services pages.
- [ ] Supply the BIAN logo and partner logos.
- [ ] Change or remove the seeded demo accounts and the default admin password.
- [ ] Connect an email provider for verification and password-reset emails.
- [ ] Set production environment values (`NODE_ENV`, `JWT_SECRET`, `CLIENT_ORIGIN`, `APP_URL`) and serve over HTTPS.
- [ ] Schedule backups of MongoDB and the uploads directory.
