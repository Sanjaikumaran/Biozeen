/**
 * Seeds roles, an administrator, and sample content drawn from the BIAN website mock-ups.
 * Sample organisations, people and listings are placeholders for administrators to
 * replace with approved BIAN content.
 *
 *   npm run seed          # only seeds an empty database
 *   npm run seed -- --reset   # drops the database first
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose, { type Types } from "mongoose";
import { config } from "./config.js";
import type { Filter } from "./lib/http.js";
import { ALL_PERMISSIONS, PERMISSIONS as P } from "./lib/permissions.js";
import { SiteSettings } from "./models/admin.js";
import type { Block, BlockType } from "./models/common.js";
import { Category, Content, Tag } from "./models/content.js";
import { FeedbackForm } from "./models/feedback.js";
import { Organization, Role, User } from "./models/identity.js";
import { Course, Event, Expert } from "./models/learning.js";

const b = (type: BlockType, data: Record<string, unknown> = {}): Block => ({ id: randomUUID(), type, data });
const days = (n: number) => new Date(Date.now() + n * 864e5);
const at = (n: number, hour: number) => {
  const d = days(n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** Populate an empty, connected database. Returns the demo credentials. */
export async function seed() {
  await mongoose.syncIndexes();

  // ------------------------------------------------------------ roles
  const memberPerms = [P.opportunitiesPost, P.expertsContact];
  const roleDefs = [
    { name: "super_admin", displayName: "Biozeen Administrator", description: "Full platform access", permissions: ALL_PERMISSIONS, isSystem: true },
    { name: "content_editor", displayName: "Content Editor", description: "Creates content and submits it for review", permissions: [P.adminAccess, P.contentManage, P.mediaUpload, P.feedbackManage, P.feedbackView], isSystem: false },
    { name: "content_publisher", displayName: "Content Publisher", description: "Reviews and publishes content", permissions: [P.adminAccess, P.contentManage, P.contentPublish, P.mediaUpload, P.feedbackManage, P.feedbackView], isSystem: false },
    { name: "member_manager", displayName: "Membership Manager", description: "Approves members and manages directories", permissions: [P.adminAccess, P.membersManage, P.organizationsManage, P.expertsManage, P.contactsManage], isSystem: false },
    { name: "member", displayName: "Member", description: "Every approved BIAN member", permissions: memberPerms, isSystem: true },
    { name: "industry", displayName: "Industry Member", description: "Industry organisation representatives", permissions: memberPerms, isSystem: true },
    { name: "academia", displayName: "Academia & Research", description: "Academic and research institution representatives", permissions: memberPerms, isSystem: true },
    { name: "startup", displayName: "Startup & Innovation", description: "Startups, incubators and innovation ecosystems", permissions: memberPerms, isSystem: true },
    { name: "expert", displayName: "Individual Expert (SME)", description: "Subject-matter experts", permissions: memberPerms, isSystem: true },
    { name: "alumni", displayName: "Alumni", description: "Programme alumni", permissions: memberPerms, isSystem: true },
    { name: "student", displayName: "Student", description: "Students and trainees", permissions: [P.expertsContact], isSystem: true },
    { name: "professional", displayName: "Professional", description: "Working professionals", permissions: memberPerms, isSystem: true },
  ];
  const roles = Object.fromEntries((await Role.insertMany(roleDefs)).map((r) => [r.name, r._id])) as Record<string, Types.ObjectId>;

  // ------------------------------------------------------------ taxonomy
  const cats = Object.fromEntries(
    (
      await Category.insertMany(
        ["Biomanufacturing", "Regulatory & Quality", "Research & Discovery", "Funding & Grants", "Careers & Talent", "Innovation & Startups"].map((name) => ({
          name,
          slug: name.toLowerCase().replace(/[^a-z]+/g, "-"),
        })),
      )
    ).map((c) => [c.name, c._id]),
  ) as Record<string, Types.ObjectId>;
  const tags = Object.fromEntries(
    (await Tag.insertMany(["GMP", "Fermentation", "Downstream", "Cell Culture", "Biologics", "Drug Discovery", "Compliance", "Bioprocess"].map((name) => ({ name, slug: name.toLowerCase().replace(/\s+/g, "-") })))).map((t) => [t.name, t._id]),
  ) as Record<string, Types.ObjectId>;

  // ------------------------------------------------------------ organisations
  const orgDefs = [
    { name: "Biozeen", orgType: "industry", partnerTier: "founding", description: "Platform owner and coordinator of the BIAN network.", location: "Hyderabad, India", contact: { name: "BIAN Secretariat", email: "bian@biozeen.com" } },
    { name: "Biocon", orgType: "industry", partnerTier: "industry", location: "Bangalore, India", contact: { name: "Ms. R. Iyer", email: "r.iyer@biocon.com" } },
    { name: "Dr. Reddy's", orgType: "industry", partnerTier: "industry", location: "Hyderabad, India" },
    { name: "Tata Biotech", orgType: "industry", partnerTier: "industry", location: "Mumbai, India", contact: { name: "Mr. S. Menon", email: "smenon@tata.com" } },
    { name: "Thermo Fisher Scientific", orgType: "industry", partnerTier: "industry", location: "India" },
    { name: "IIT Madras", orgType: "academia", partnerTier: "knowledge", location: "Chennai, India", contact: { name: "Dr. S. Kumar", email: "skumar@iitm.ac.in" } },
    { name: "CSIR", orgType: "research", partnerTier: "knowledge", location: "New Delhi, India", contact: { name: "Dr. P. Singh", email: "psingh@csir.res.in" } },
    { name: "EduBiotech", orgType: "academia", partnerTier: "knowledge", location: "India", contact: { name: "Dr. L. Rao", email: "lrao@edubiotech.ac.in" } },
    { name: "SterileTech", orgType: "innovation", partnerTier: "innovation", location: "India", contact: { name: "Ms. R. Nair", email: "rnair@steriletech.com" } },
    { name: "NovaLife Sciences", orgType: "startup", partnerTier: "none", status: "pending", visibility: "internal", contact: { name: "Dr. A. Verma", email: "averma@novalife.in" } },
    { name: "NextBio", orgType: "startup", partnerTier: "none", status: "pending", visibility: "internal", contact: { name: "Mr. K. Das", email: "kdas@nextbio.in" } },
    { name: "BioPharma Solutions", orgType: "industry", partnerTier: "none", visibility: "internal", contact: { name: "Operations", email: "industry@demo.bian.local" } },
  ];
  const orgs = Object.fromEntries(
    (
      await Organization.insertMany(
        orgDefs.map((o) => ({
          status: "approved",
          visibility: "public",
          description: "Profile details to be provided by the partner organisation.",
          collaborationAreas: [],
          ...o,
          slug: o.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        })),
      )
    ).map((o) => [o.name, o._id]),
  ) as Record<string, Types.ObjectId>;

  // ------------------------------------------------------------ users
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "BianAdmin2026";
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "BianDemo2026";
  const [adminHash, demoHash] = await Promise.all([bcrypt.hash(adminPassword, 12), bcrypt.hash(demoPassword, 12)]);
  const base = { status: "active" as const, emailVerified: true, passwordHash: demoHash };
  const admin = await User.create(<Filter>{ ...base, passwordHash: adminHash, email: "admin@bian.local", name: "Biozeen Administrator", accountType: "individual", category: "other", organization: orgs.Biozeen, roles: [roles.super_admin, roles.member] });
  const [industry, student] = await User.insertMany(<Filter[]>[
    { ...base, email: "industry@demo.bian.local", name: "BioPharma Solutions", accountType: "organization", category: "industry", organization: orgs["BioPharma Solutions"], roles: [roles.member, roles.industry], profile: { designation: "Industry Member" } },
    { ...base, email: "student@demo.bian.local", name: "Ananya Student", accountType: "individual", category: "student", roles: [roles.member, roles.student], profile: { institution: "IIT Madras", interests: ["Fermentation"] } },
  ]);
  await User.create(<Filter>{ ...base, email: "editor@demo.bian.local", name: "Content Editor", accountType: "individual", category: "other", roles: [roles.content_editor, roles.member] });
  await User.create(<Filter>{ ...base, status: "pending", email: "pending@demo.bian.local", name: "Pending Startup Founder", accountType: "organization", category: "startup", organization: orgs.NextBio });

  const expertPeople = [
    { name: "Dr. Priya Sharma", email: "priya.sharma@demo.bian.local", expert: { headline: "Bioprocess Expert", expertType: "industry_expert", domain: "Biopharma", yearsExperience: 15, skills: ["Downstream", "Process Dev"], expertiseAreas: ["Bioprocess development", "Scale-up"], location: "Bangalore, India", mentoringAvailable: true, visibility: "public" } },
    { name: "Dr. Arvind Rao", email: "arvind.rao@demo.bian.local", expert: { headline: "Research Scientist", expertType: "research_expert", domain: "Drug Discovery", yearsExperience: 12, skills: ["Immunology", "Cell Culture"], expertiseAreas: ["Assay development"], location: "Hyderabad, India", visibility: "public" } },
    { name: "Ms. Neha Mehta", email: "neha.mehta@demo.bian.local", expert: { headline: "Regulatory Consultant", expertType: "consultant", domain: "Global Regulatory", yearsExperience: 10, skills: ["GMP", "Compliance"], expertiseAreas: ["Regulatory submissions"], location: "Mumbai, India", visibility: "public" } },
    { name: "Dr. Kavita Iyer", email: "kavita.iyer@demo.bian.local", expert: { headline: "GMP Trainer", expertType: "trainer", domain: "Quality", yearsExperience: 18, skills: ["GMP", "Validation"], expertiseAreas: ["Quality systems training"], location: "Chennai, India", visibility: "members" } },
    { name: "Mr. Rohan Kapoor", email: "rohan.kapoor@demo.bian.local", expert: { headline: "Startup Mentor", expertType: "mentor", domain: "Innovation", yearsExperience: 20, skills: ["Fundraising", "Go-to-market"], expertiseAreas: ["Biotech venture building"], location: "Pune, India", mentoringAvailable: true, visibility: "members" } },
  ];
  for (const p of expertPeople) {
    const u = await User.create(<Filter>{ ...base, email: p.email, name: p.name, accountType: "individual", category: "sme", roles: [roles.member, roles.expert] });
    await Expert.create(<Filter>{ ...p.expert, user: u._id, status: "approved", bio: "Profile summary to be completed by the expert.", shareEmail: false });
  }

  // ------------------------------------------------------------ feedback forms
  const [contentForm, lessonForm, eventForm, courseForm] = await FeedbackForm.insertMany([
    {
      title: "Was this helpful?",
      description: "Tell us how useful this resource was.",
      anonymity: "optional",
      submissionPolicy: "once",
      createdBy: admin._id,
      questions: [
        { type: "rating", label: "How useful was this content?", required: true, scaleMax: 5 },
        { type: "yes_no", label: "Would you recommend it to a colleague?" },
        { type: "long_text", label: "What could we improve?" },
      ],
    },
    {
      title: "Lesson evaluation",
      anonymity: "identified",
      submissionPolicy: "once",
      createdBy: admin._id,
      questions: [
        { type: "rating", label: "Rate this lesson", required: true },
        { type: "single_choice", label: "The pace of this lesson was…", required: true, options: [{ label: "Too slow" }, { label: "Just right" }, { label: "Too fast" }] },
        { type: "short_text", label: "One thing you learned" },
      ],
    },
    {
      title: "Event feedback",
      anonymity: "anonymous",
      submissionPolicy: "once",
      createdBy: admin._id,
      questions: [
        { type: "rating", label: "Overall, how would you rate this event?", required: true },
        { type: "multiple_choice", label: "Which sessions were most valuable?", options: [{ label: "Keynotes" }, { label: "Panel discussions" }, { label: "Networking" }, { label: "Workshops" }] },
        { type: "nps", label: "How likely are you to attend the next BIAN event? (0–10)" },
        { type: "long_text", label: "Any other comments?" },
      ],
    },
    {
      title: "Course evaluation",
      anonymity: "identified",
      submissionPolicy: "once",
      createdBy: admin._id,
      questions: [
        { type: "rating", label: "Overall course rating", required: true },
        { type: "rating", label: "Quality of course materials", required: true },
        { type: "yes_no", label: "Did the course meet its stated objectives?", required: true },
        { type: "long_text", label: "Suggestions for future courses" },
      ],
    },
  ]);

  // ------------------------------------------------------------ site settings
  await SiteSettings.create({
    key: "site",
    hero: {
      headline: ["One Network.", "Multiple Opportunities."],
      highlight: "A Stronger Biotech Future.",
      subheading: "Connecting Industry, Academia, Innovation and Expertise for a sustainable bioeconomy.",
      keywords: ["Innovate", "Collaborate", "Develop", "Transform"],
    },
    contact: {
      email: "bian@biozeen.com",
      phone: "+91 40 2980 1234",
      address: "Biozeen, Hyderabad, India",
      ownerLine: "Powered by Biozeen · Platform Owner & Coordinator",
      quote: "Building a collaborative ecosystem for a healthier, more sustainable world.",
    },
  });

  // ------------------------------------------------------------ CMS content
  const published = { status: "published", publishedAt: new Date(), author: admin._id };
  const placeholder = b("callout", { tone: "warning", title: "Placeholder content", text: "This section is ready for approved BIAN company content. Edit it in Admin → Content." });

  await Content.insertMany([
    {
      ...published,
      type: "page",
      slug: "about",
      title: "About BIAN",
      summary: "The Biozeen Industry Academy Network (BIAN) bridges industry, academia and innovation for a healthier, more sustainable tomorrow.",
      blocks: [
        b("heading", { text: "Connect · Collaborate · Innovate · Grow", level: 2 }),
        b("richText", { html: "<p>BIAN brings together industry partners, academic and research institutions, startups, subject-matter experts and alumni in one network so that people, partnerships, ideas and knowledge translate into opportunities and impact.</p>" }),
        b("cards", {
          cards: [
            { title: "Vision", text: "To be provided by BIAN administrators." },
            { title: "Mission", text: "To be provided by BIAN administrators." },
            { title: "Values", text: "To be provided by BIAN administrators." },
          ],
        }),
        placeholder,
      ],
      portfolio: { section: "overview" },
      order: 0,
    },
    ...[
      ["Hire Talent", "Find trained candidates and interns from partner institutions.", "Careers & Talent"],
      ["Find Experts", "Reach subject-matter experts, consultants, trainers and mentors.", "Research & Discovery"],
      ["Collaborate", "Start research collaborations and technology-transfer projects.", "Research & Discovery"],
      ["Access Funding", "Discover grants, fellowships and government schemes.", "Funding & Grants"],
      ["Learn & Grow", "Webinars, workshops, courses and training materials.", "Biomanufacturing"],
      ["Share Resources", "Templates, SOPs, reports and case studies from the network.", "Regulatory & Quality"],
    ].map(([title, summary, cat], i) => ({
      ...published,
      type: "service",
      slug: title!.toLowerCase().replace(/[^a-z]+/g, "-"),
      title,
      summary,
      categories: [cats[cat!]],
      order: i,
      blocks: [b("richText", { html: `<p>${summary}</p>` }), placeholder],
    })),
    {
      type: "project",
      slug: "sample-project",
      title: "Sample project (draft)",
      summary: "Use this draft as a template for projects and case studies.",
      status: "draft",
      author: admin._id,
      blocks: [placeholder],
      portfolio: { section: "projects" },
    },
  ]);

  const opp = (o: Record<string, unknown>) => ({ ...published, type: "opportunity", feedbackForm: contentForm!._id, ...o });
  await Content.insertMany([
    opp({
      title: "Bioprocess Development Scientist",
      slug: "bioprocess-development-scientist",
      summary: "Lead upstream and downstream process development for biologics programmes.",
      publishedAt: days(-2),
      categories: [cats.Biomanufacturing, cats["Careers & Talent"]],
      tags: [tags.Bioprocess, tags.Downstream],
      access: { visibility: "public" },
      opportunity: { opportunityType: "hiring", organization: orgs.Biocon, organizationName: "Biocon", location: "Bangalore, India", workMode: "onsite", employmentType: "Full-time", deadline: days(30), applyUrl: "https://example.com/apply" },
      blocks: [
        b("heading", { text: "Role overview", level: 2 }),
        b("richText", { html: "<p>Sample listing from the BIAN mock-ups. Replace with the partner's approved job description.</p>" }),
        b("heading", { text: "Eligibility", level: 3 }),
        b("list", { ordered: false, items: ["M.Tech / PhD in Biotechnology or Chemical Engineering", "3+ years in process development", "Hands-on chromatography experience"] }),
        b("cta", { title: "Ready to apply?", text: "Applications are handled by the hiring organisation.", buttonLabel: "Apply now", buttonUrl: "https://example.com/apply" }),
      ],
    }),
    opp({
      title: "Internship – Fermentation",
      slug: "internship-fermentation",
      summary: "Six-month research internship in microbial fermentation and scale-up.",
      publishedAt: days(-3),
      categories: [cats["Research & Discovery"]],
      tags: [tags.Fermentation],
      access: { visibility: "authenticated" },
      opportunity: { opportunityType: "internship", organization: orgs["IIT Madras"], organizationName: "IIT Madras", location: "Chennai, India", workMode: "onsite", employmentType: "Internship", deadline: days(21) },
      blocks: [b("richText", { html: "<p>Available to signed-in BIAN members. Sample listing — replace with approved details.</p>" })],
    }),
    opp({
      title: "Regulatory Consultant (SME)",
      slug: "regulatory-consultant-sme",
      summary: "Consulting engagement supporting global regulatory submissions for biosimilars.",
      publishedAt: days(-5),
      categories: [cats["Regulatory & Quality"]],
      tags: [tags.Compliance, tags.GMP],
      access: { visibility: "roles", roles: [roles.expert, roles.professional, roles.industry] },
      opportunity: { opportunityType: "consultancy", organization: orgs["Dr. Reddy's"], organizationName: "Dr. Reddy's", location: "Hyderabad, India", workMode: "hybrid", employmentType: "Consulting" },
      blocks: [b("callout", { tone: "info", title: "Restricted listing", text: "Visible only to experts, professionals and industry members." })],
    }),
    opp({
      title: "Summer Research Fellowship for Students",
      slug: "summer-research-fellowship",
      summary: "Eight-week mentored research placements at partner laboratories.",
      publishedAt: days(-1),
      categories: [cats["Funding & Grants"]],
      access: { visibility: "roles", roles: [roles.student] },
      opportunity: { opportunityType: "training", organizationName: "BIAN", location: "Multiple locations", workMode: "onsite", deadline: days(45) },
      blocks: [b("richText", { html: "<p>Student-only sample listing demonstrating role-restricted publishing.</p>" })],
    }),
    opp({
      title: "Technology Transfer: Novel Expression Platform",
      slug: "technology-transfer-expression-platform",
      summary: "Licensing opportunity for a high-yield microbial expression platform.",
      publishedAt: days(-8),
      categories: [cats["Innovation & Startups"]],
      access: { visibility: "public" },
      opportunity: { opportunityType: "technology_transfer", organization: orgs.CSIR, organizationName: "CSIR", location: "New Delhi, India", workMode: "remote" },
      blocks: [b("richText", { html: "<p>Sample listing — replace with approved details.</p>" })],
    }),
  ]);

  const knowledge = [
    ["industry_insights", "Biomanufacturing Outlook", "Reports, trends and market updates from across the network.", "public", cats.Biomanufacturing],
    ["research_repository", "Publications and Case Studies", "Publications, case studies and whitepapers.", "authenticated", cats["Research & Discovery"]],
    ["regulatory_corner", "GMP Essentials for Biologics", "GMP, compliance and global regulatory updates.", "public", cats["Regulatory & Quality"]],
    ["learning_center", "Webinar Library", "Webinars, workshops and training materials.", "authenticated", cats.Biomanufacturing],
    ["funding_opportunities", "Grants and Fellowships Guide", "Grants, fellowships and government schemes.", "public", cats["Funding & Grants"]],
    ["innovation_center", "Startup Resource Kit", "Startup resources and incubation support.", "authenticated", cats["Innovation & Startups"]],
    ["templates_downloads", "SOP Templates", "SOPs, formats and templates.", "roles", cats["Regulatory & Quality"]],
    ["success_stories", "Collaboration Stories", "Real collaborations. Real impact.", "public", cats["Research & Discovery"]],
  ] as const;
  await Content.insertMany(
    knowledge.map(([section, title, summary, visibility, cat], i) => ({
      ...published,
      publishedAt: days(-i - 1),
      type: i % 3 === 2 ? "tutorial" : "article",
      slug: title.toLowerCase().replace(/[^a-z]+/g, "-"),
      title,
      summary,
      categories: [cat],
      tags: i % 2 ? [tags.GMP] : [tags.Bioprocess],
      knowledge: { section, readingMinutes: 4 + i },
      access: visibility === "roles" ? { visibility, roles: [roles.industry, roles.professional, roles.expert] } : { visibility },
      feedbackForm: contentForm!._id,
      blocks: [
        b("heading", { text: "Overview", level: 2 }),
        b("richText", { html: `<p>${summary} This is sample knowledge content; replace it with approved material in the CMS.</p>` }),
        b("faq", { items: [{ q: "Who can access this resource?", a: visibility === "public" ? "Everyone." : visibility === "authenticated" ? "All signed-in BIAN members." : "Selected member roles." }] }),
      ],
    })),
  );

  await Content.insertMany([
    { ...published, type: "announcement", slug: "new-industry-partner-thermo-fisher", title: "New Industry Partner Onboarded – Thermo Fisher Scientific", summary: "Welcoming a new industry partner to the BIAN network.", publishedAt: days(-2), blocks: [b("richText", { html: "<p>Sample announcement from the mock-ups.</p>" })] },
    { ...published, type: "announcement", slug: "birac-funding-call-startups", title: "BIRAC Funding Call for Startups – Apply Now", summary: "A funding call relevant to startup members.", publishedAt: days(-4), access: { visibility: "authenticated" }, blocks: [b("richText", { html: "<p>Sample announcement for signed-in members.</p>" })] },
    { ...published, type: "announcement", slug: "expert-mentorship-program", title: "BIAN Launches Expert Mentorship Program", summary: "Members can now request mentoring from experts in the network.", publishedAt: days(-7), blocks: [b("richText", { html: "<p>Browse the Experts Network to send a mentoring request.</p>" })] },
  ]);

  // ------------------------------------------------------------ course
  await Course.create(<Filter>{
    ...published,
    title: "Fundamentals of Bioprocessing",
    slug: "fundamentals-of-bioprocessing",
    summary: "A short introductory course on upstream and downstream bioprocessing.",
    description: "Sample course demonstrating modules, lessons, progress tracking and lesson-level feedback.",
    level: "beginner",
    objectives: ["Describe the stages of a bioprocess", "Explain key upstream parameters", "Outline common downstream purification steps"],
    categories: [cats.Biomanufacturing],
    access: { visibility: "authenticated" },
    feedbackForm: courseForm!._id,
    modules: [
      {
        title: "Upstream processing",
        lessons: [
          { title: "Cell lines and media", durationMinutes: 15, feedbackForm: lessonForm!._id, blocks: [b("richText", { html: "<p>Sample lesson content.</p>" }), b("list", { ordered: true, items: ["Cell line selection", "Media design", "Seed train"] })] },
          { title: "Bioreactor operations", durationMinutes: 20, feedbackForm: lessonForm!._id, blocks: [b("richText", { html: "<p>Sample lesson content.</p>" }), b("table", { headers: ["Parameter", "Typical control"], rows: [["Temperature", "36–37 °C"], ["pH", "6.8–7.2"], ["Dissolved O₂", "30–60 %"]] })] },
        ],
      },
      {
        title: "Downstream processing",
        lessons: [
          { title: "Harvest and clarification", durationMinutes: 15, feedbackForm: lessonForm!._id, blocks: [b("richText", { html: "<p>Sample lesson content.</p>" })] },
          { title: "Chromatography basics", durationMinutes: 25, feedbackForm: lessonForm!._id, blocks: [b("richText", { html: "<p>Sample lesson content.</p>" }), b("callout", { tone: "success", title: "Tip", text: "Mark lessons complete to track your progress." })] },
        ],
      },
    ],
  });

  // ------------------------------------------------------------ events
  await Event.insertMany([
    { ...published, title: "Annual BIAN Summit", slug: "annual-bian-summit", summary: "Industry–Academia Collaboration for a Sustainable Future", eventType: "summit", startAt: at(40, 9), endAt: at(40, 18), location: { mode: "in_person", venue: "To be announced", city: "Bengaluru, India" }, registration: { enabled: true, capacity: 300 }, feedbackForm: eventForm!._id, blocks: [b("richText", { html: "<p>Sample event from the mock-ups. Agenda to be published.</p>" })] },
    { ...published, title: "Webinar: Advances in Bioprocessing", slug: "webinar-advances-in-bioprocessing", summary: "Expert talk on recent advances in continuous bioprocessing.", eventType: "webinar", startAt: at(14, 16), endAt: at(14, 17), location: { mode: "online", meetingUrl: "https://example.com/meeting" }, registration: { enabled: true }, access: { visibility: "authenticated" }, feedbackForm: eventForm!._id, blocks: [b("richText", { html: "<p>The meeting link is shared with registered members.</p>" })] },
    { ...published, title: "Workshop: Regulatory Pathways for Biologics", slug: "workshop-regulatory-pathways-for-biologics", summary: "Hands-on workshop on regulatory strategy.", eventType: "workshop", startAt: at(28, 10), endAt: at(28, 16), location: { mode: "in_person", city: "Hyderabad, India" }, registration: { enabled: true, capacity: 40 }, feedbackForm: eventForm!._id, blocks: [b("richText", { html: "<p>Sample workshop.</p>" })] },
    { ...published, title: "Industry Visit: Biologics Manufacturing Facility", slug: "industry-visit-biologics-facility", summary: "Guided visit for student members.", eventType: "industry_visit", startAt: at(55, 10), location: { mode: "in_person", city: "Bangalore, India" }, registration: { enabled: true, capacity: 25 }, access: { visibility: "roles", roles: [roles.student, roles.alumni] }, blocks: [b("richText", { html: "<p>Restricted to students and alumni.</p>" })] },
  ]);

  return { adminPassword, demoPassword, industryEmail: industry!.email, studentEmail: student!.email };
}

async function main() {
  await mongoose.connect(config.mongoUri);
  if (process.argv.includes("--reset")) {
    await mongoose.connection.dropDatabase();
    console.log("Database dropped");
  } else if (await Role.exists({})) {
    console.log("Database already seeded. Use `npm run seed -- --reset` to start over.");
    return;
  }
  const creds = await seed();
  console.log("\nSeed complete.");
  console.log(`  Admin:      admin@bian.local / ${creds.adminPassword}`);
  console.log(`  Industry:   ${creds.industryEmail} / ${creds.demoPassword}`);
  console.log(`  Student:    ${creds.studentEmail} / ${creds.demoPassword}`);
  console.log(`  Editor:     editor@demo.bian.local / ${creds.demoPassword}`);
  console.log(`  Expert:     priya.sharma@demo.bian.local / ${creds.demoPassword}`);
  console.log("  Change these passwords before any shared deployment.\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}
