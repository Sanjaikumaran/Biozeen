/**
 * End-to-end API tests covering authentication, role-based access, publishing,
 * protected files and feedback privacy. Requires a running MongoDB; uses a
 * throwaway database (MONGO_URI_TEST, default bian_test) that is dropped first.
 *
 *   npm test
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";

process.env.MONGO_URI = process.env.MONGO_URI_TEST ?? "mongodb://127.0.0.1:27017/bian_test";
process.env.REQUIRE_APPROVAL = "true";
process.env.REQUIRE_EMAIL_VERIFICATION = "true";
process.env.UPLOAD_DIR = `${process.env.TMPDIR ?? "/tmp"}/bian-test-uploads`;

const { createServer } = await import("node:http");
const { io: connectSocket } = await import("socket.io-client");
const { app } = await import("../src/app.js");
const { config } = await import("../src/config.js");
const { attachRealtime } = await import("../src/lib/realtime.js");
const { seed } = await import("../src/seed.js");
const { User, Role } = await import("../src/models/identity.js");
const { Content } = await import("../src/models/content.js");
const { FeedbackSubmission } = await import("../src/models/feedback.js");

let server: Server;
let base = "";
let creds: Awaited<ReturnType<typeof seed>>;

/** Minimal cookie-keeping client. */
class Client {
  cookie = "";
  async req(method: string, path: string, body?: unknown) {
    const headers: Record<string, string> = {};
    if (this.cookie) headers.cookie = this.cookie;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + path, { method, headers, body: payload });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0]!;
    const text = await res.text();
    let json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, body: json, headers: res.headers };
  }
  get = (p: string) => this.req("GET", p);
  post = (p: string, b?: unknown) => this.req("POST", p, b ?? {});
  put = (p: string, b: unknown) => this.req("PUT", p, b);
  patch = (p: string, b: unknown) => this.req("PATCH", p, b);
  del = (p: string) => this.req("DELETE", p);
  async login(email: string, password: string) {
    const r = await this.post("/api/auth/login", { email, password });
    assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.body)}`);
    return this;
  }
}

const anon = new Client();
const admin = new Client();
const student = new Client();
const industry = new Client();
const editor = new Client();

before(async () => {
  await mongoose.connect(process.env.MONGO_URI!);
  await mongoose.connection.dropDatabase();
  creds = await seed();
  server = createServer(app);
  attachRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await admin.login("admin@bian.local", creds.adminPassword);
  await student.login(creds.studentEmail, creds.demoPassword);
  await industry.login(creds.industryEmail, creds.demoPassword);
  await editor.login("editor@demo.bian.local", creds.demoPassword);
});

after(async () => {
  server?.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe("content access control", () => {
  it("filters listings by audience", async () => {
    const titles = async (c: Client) => (await c.get("/api/contents?type=opportunity&limit=50")).body.items.map((i: { title: string }) => i.title);
    const a = await titles(anon);
    const s = await titles(student);
    const i = await titles(industry);
    assert.ok(!a.includes("Internship – Fermentation"), "member-only hidden from visitors");
    assert.ok(s.includes("Summer Research Fellowship for Students"), "student role sees student listing");
    assert.ok(!i.includes("Summer Research Fellowship for Students"), "industry does not see student-only listing");
    assert.ok(i.includes("Regulatory Consultant (SME)"), "industry role sees industry listing");
    assert.ok(!s.includes("Regulatory Consultant (SME)"), "student does not see industry listing");
  });

  it("enforces access on direct URLs", async () => {
    assert.equal((await anon.get("/api/contents/by-slug/opportunity/internship-fermentation")).status, 401);
    assert.equal((await student.get("/api/contents/by-slug/opportunity/regulatory-consultant-sme")).status, 403);
    assert.equal((await industry.get("/api/contents/by-slug/opportunity/regulatory-consultant-sme")).status, 200);
    // Drafts are indistinguishable from missing pages for non-editors.
    assert.equal((await anon.get("/api/contents/by-slug/portfolio/sample-project")).status, 404);
    const preview = await admin.get("/api/contents/by-slug/portfolio/sample-project");
    assert.equal(preview.status, 200);
    assert.equal(preview.body.preview, true);
  });

  it("applies the same rules to search, courses and events", async () => {
    const s = (await anon.get("/api/search?q=Regulatory")).body;
    assert.ok(!s.contents.some((c: { title: string }) => c.title === "Regulatory Consultant (SME)"));
    assert.equal((await anon.get("/api/courses/fundamentals-of-bioprocessing")).status, 401);
    assert.equal((await student.get("/api/courses/fundamentals-of-bioprocessing")).status, 200);
    assert.equal((await industry.get("/api/events/industry-visit-biologics-facility")).status, 403);
  });

  it("does not leak meeting links before registration", async () => {
    const before = (await student.get("/api/events/webinar-advances-in-bioprocessing")).body;
    assert.equal(before.location.meetingUrl, undefined);
    assert.equal((await student.post(`/api/events/${before._id}/register`)).status, 201);
    const afterReg = (await student.get("/api/events/webinar-advances-in-bioprocessing")).body;
    assert.ok(afterReg.location.meetingUrl);
  });

  it("publishes scheduled content only once due", async () => {
    const r = await admin.post("/api/admin/contents", { type: "announcement", title: "Scheduled notice", status: "scheduled", publishAt: new Date(Date.now() + 864e5).toISOString(), access: { visibility: "public", roles: [], organizations: [] } });
    assert.equal(r.status, 201);
    const visible = async () => (await anon.get("/api/contents?type=announcement")).body.items.some((i: { title: string }) => i.title === "Scheduled notice");
    assert.equal(await visible(), false);
    await Content.updateOne({ _id: r.body._id }, { publishAt: new Date(Date.now() - 1000) });
    assert.equal(await visible(), true);
  });
});

describe("authorization", () => {
  it("blocks members from admin APIs", async () => {
    assert.equal((await student.get("/api/admin/stats")).status, 403);
    assert.equal((await anon.get("/api/admin/users")).status, 401);
    assert.equal((await industry.post("/api/admin/contents", { type: "article", title: "x" })).status, 403);
  });

  it("lets editors draft but not publish or delete", async () => {
    const draft = await editor.post("/api/admin/contents", { type: "article", title: "Editor draft", status: "draft" });
    assert.equal(draft.status, 201);
    assert.equal((await editor.post(`/api/admin/contents/${draft.body._id}/status`, { status: "published" })).status, 403);
    assert.equal((await editor.post(`/api/admin/contents/${draft.body._id}/status`, { status: "pending_review" })).status, 200);
    assert.equal((await editor.del(`/api/admin/contents/${draft.body._id}`)).status, 403);
    assert.equal((await editor.get("/api/admin/users")).status, 403);
  });

  it("sanitises rich text and unsafe URLs", async () => {
    const r = await admin.post("/api/admin/contents", {
      type: "article",
      title: "XSS attempt",
      blocks: [
        { type: "richText", data: { html: '<p onclick="x()">Hi<script>alert(1)</script><a href="javascript:alert(1)">l</a></p>' } },
        { type: "cta", data: { title: "t", buttonUrl: "javascript:alert(1)" } },
      ],
    });
    const html = r.body.blocks[0].data.html as string;
    assert.ok(!/script|onclick|javascript:/i.test(html), html);
    assert.equal(r.body.blocks[1].data.buttonUrl, "");
  });

  it("revokes sessions when an account is suspended", async () => {
    const victim = await new Client().login("priya.sharma@demo.bian.local", creds.demoPassword);
    assert.ok((await victim.get("/api/auth/me")).body.user);
    const u = await User.findOne({ email: "priya.sharma@demo.bian.local" });
    assert.equal((await admin.patch(`/api/admin/users/${u!._id}`, { status: "suspended" })).status, 200);
    assert.equal((await victim.get("/api/auth/me")).body.user, null);
    const relog = await new Client().post("/api/auth/login", { email: "priya.sharma@demo.bian.local", password: creds.demoPassword });
    assert.equal(relog.status, 403);
  });

  it("keeps at least one super administrator", async () => {
    const me = await User.findOne({ email: "admin@bian.local" });
    assert.equal((await admin.patch(`/api/admin/users/${me!._id}`, { status: "suspended" })).status, 409);
  });
});

describe("registration workflow", () => {
  it("requires verification and approval before sign-in", async () => {
    const c = new Client();
    const reg = await c.post("/api/auth/register", { category: "startup", name: "New Founder", email: "founder@example.com", password: "Founder12345", organizationName: "Seedling Bio", acceptTerms: true });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    assert.equal((await c.post("/api/auth/login", { email: "founder@example.com", password: "Founder12345" })).status, 403);
    const url = new URL(reg.body.devVerificationUrl);
    assert.equal((await c.post("/api/auth/verify-email", { token: url.searchParams.get("token"), email: url.searchParams.get("email") })).status, 200);
    const pending = await c.post("/api/auth/login", { email: "founder@example.com", password: "Founder12345" });
    assert.equal(pending.status, 403);
    assert.match(pending.body.error, /awaiting approval/);
    const u = await User.findOne({ email: "founder@example.com" });
    assert.equal((await admin.post(`/api/admin/users/${u!._id}/approve`)).status, 200);
    await c.login("founder@example.com", "Founder12345");
    const me = (await c.get("/api/auth/me")).body.user;
    assert.deepEqual(me.roles.sort(), ["member", "startup"]);
  });

  it("rejects weak passwords and duplicate emails", async () => {
    const weak = await anon.post("/api/auth/register", { category: "student", name: "A B", email: "weak@example.com", password: "short", acceptTerms: true });
    assert.equal(weak.status, 400);
    assert.ok(weak.body.details.password);
    const dup = await anon.post("/api/auth/register", { category: "student", name: "A B", email: "admin@bian.local", password: "Password12345", acceptTerms: true });
    assert.equal(dup.status, 409);
  });
});

describe("protected media", () => {
  it("serves files only to viewers of the linked content", async () => {
    const fd = new FormData();
    fd.append("file", new Blob(["%PDF-1.4 test"], { type: "application/pdf" }), "sop.pdf");
    const up = await admin.req("POST", "/api/admin/media", fd);
    assert.equal(up.status, 201, JSON.stringify(up.body));
    const industryRole = await Role.findOne({ name: "industry" });
    const c = await admin.post("/api/admin/contents", {
      type: "article",
      title: "Industry SOP pack",
      status: "published",
      access: { visibility: "roles", roles: [String(industryRole!._id)], organizations: [] },
      blocks: [{ type: "file", data: { mediaId: up.body._id, label: "SOP" } }],
    });
    assert.equal(c.status, 201);
    const file = `/api/media/${up.body._id}/file`;
    assert.equal((await anon.get(file)).status, 401);
    assert.equal((await student.get(file)).status, 403);
    const ok = await industry.get(file);
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get("cache-control") ?? "", /private/);
  });

  it("rejects disallowed or spoofed uploads", async () => {
    const svg = new FormData();
    svg.append("file", new Blob(["<svg onload=alert(1)>"], { type: "image/svg+xml" }), "x.svg");
    assert.equal((await admin.req("POST", "/api/admin/media", svg)).status, 400);
    const fake = new FormData();
    fake.append("file", new Blob(["not a png"], { type: "image/png" }), "x.png");
    assert.equal((await admin.req("POST", "/api/admin/media", fake)).status, 400);
  });
});

describe("feedback", () => {
  it("records anonymous feedback without identity and enforces one response", async () => {
    const ev = (await student.get("/api/events/webinar-advances-in-bioprocessing")).body;
    const form = ev.feedbackForm;
    assert.equal(form.anonymity, "anonymous");
    const rating = form.questions.find((q: { type: string }) => q.type === "rating");
    const submit = () => student.post("/api/feedback/submit", { formId: form._id, targetKind: "event", targetId: ev._id, answers: { [rating._id]: 4 } });
    assert.equal((await submit()).status, 201);
    assert.equal((await submit()).status, 409);
    const stored = await FeedbackSubmission.findOne({ event: ev._id }).lean();
    assert.equal(stored!.user, undefined);
    assert.equal(stored!.anonymous, true);
    assert.equal(stored!.respondentCategory, undefined);
  });

  it("validates answers and blocks feedback on restricted items", async () => {
    const opp = (await industry.get("/api/contents/by-slug/opportunity/regulatory-consultant-sme")).body;
    const form = opp.feedbackForm;
    const rating = form.questions.find((q: { type: string }) => q.type === "rating");
    assert.equal((await industry.post("/api/feedback/submit", { formId: form._id, targetKind: "content", targetId: opp._id, answers: {} })).status, 400);
    assert.equal((await industry.post("/api/feedback/submit", { formId: form._id, targetKind: "content", targetId: opp._id, answers: { [rating._id]: 9 } })).status, 400);
    assert.equal((await student.post("/api/feedback/submit", { formId: form._id, targetKind: "content", targetId: opp._id, answers: { [rating._id]: 5 } })).status, 404);
    assert.equal((await industry.post("/api/feedback/submit", { formId: form._id, targetKind: "content", targetId: opp._id, answers: { [rating._id]: 5 } })).status, 201);
  });

  it("supports lesson-level feedback and analytics by lesson", async () => {
    const course = (await student.get("/api/courses/fundamentals-of-bioprocessing")).body;
    const lessonId = course.modules[0].lessons[0]._id;
    const lesson = (await student.get(`/api/courses/fundamentals-of-bioprocessing/lessons/${lessonId}`)).body.lesson;
    const [rating, pace] = lesson.feedbackForm.questions;
    const r = await student.post("/api/feedback/submit", { formId: lesson.feedbackForm._id, targetKind: "lesson", targetId: course._id, lessonId, answers: { [rating._id]: 2, [pace._id]: pace.options[2]._id } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const summary = (await admin.get(`/api/admin/feedback/analytics/summary?courseId=${course._id}`)).body;
    const row = summary.byTarget.find((t: { lessonId?: string }) => t.lessonId === lessonId);
    assert.equal(row.count, 1);
    assert.equal(row.avg, 2);
  });

  it("hides identities from admins without the identified-feedback permission", async () => {
    const asEditor = (await editor.get("/api/admin/feedback/analytics/responses")).body;
    assert.ok(asEditor.items.length > 0);
    assert.ok(asEditor.items.every((i: { user: unknown }) => i.user === null));
    const studentId = (await User.findOne({ email: creds.studentEmail }))!._id;
    assert.equal((await editor.get(`/api/admin/feedback/analytics/responses?userId=${studentId}`)).status, 403);
    const asAdmin = (await admin.get(`/api/admin/feedback/analytics/responses?userId=${studentId}`)).body;
    assert.ok(asAdmin.items.length > 0 && asAdmin.items.every((i: { user: { email: string } }) => i.user?.email === creds.studentEmail));
  });
});

describe("contact centre", () => {
  it("validates and stores requests, keeps notes internal", async () => {
    const bad = await anon.post("/api/contact", { name: "A", email: "nope", category: "", type: "general", message: "hi" });
    assert.equal(bad.status, 400);
    const ok = await student.post("/api/contact", { name: "Ananya", email: "s@example.com", category: "student", type: "collaboration", message: "We would like to collaborate on a project.", startedAt: Date.now() - 10_000 });
    assert.equal(ok.status, 201);
    const list = (await admin.get("/api/admin/contacts?type=collaboration")).body;
    const req = list.items[0];
    await admin.post(`/api/admin/contacts/${req._id}/notes`, { text: "internal only" });
    await admin.patch(`/api/admin/contacts/${req._id}`, { response: "Thanks, we will connect you." });
    const mine = (await student.get("/api/me/requests")).body;
    assert.equal(mine[0].response, "Thanks, we will connect you.");
    assert.equal(mine[0].notes, undefined);
    assert.equal(mine[0].status, "responded");
  });
});

describe("account preferences", () => {
  it("saves a member's theme and returns it with the session", async () => {
    assert.equal((await anon.put("/api/auth/me/preferences", { themeMode: "dark", accent: "ocean" })).status, 401);
    assert.equal((await student.put("/api/auth/me/preferences", { themeMode: "neon", accent: "ocean" })).status, 400);
    assert.equal((await student.put("/api/auth/me/preferences", { themeMode: "dark", accent: "ocean" })).status, 200);
    const me = await student.get("/api/auth/me");
    assert.deepEqual(me.body.user.preferences, { themeMode: "dark", accent: "ocean", customColor: null });
  });

  it("saves a custom theme colour, which must be a hex colour", async () => {
    assert.equal((await student.put("/api/auth/me/preferences", { themeMode: "light", accent: "custom" })).status, 400);
    assert.equal((await student.put("/api/auth/me/preferences", { themeMode: "light", accent: "custom", customColor: "red" })).status, 400);
    assert.equal((await student.put("/api/auth/me/preferences", { themeMode: "light", accent: "custom", customColor: "#c2185b" })).status, 200);
    const me = await student.get("/api/auth/me");
    assert.deepEqual(me.body.user.preferences, { themeMode: "light", accent: "custom", customColor: "#c2185b" });
  });
});

describe("sign-in codes", () => {
  it("requires the emailed code after the password when enabled", async () => {
    config.loginOtp = true;
    try {
      const c = new Client();
      const step1 = await c.post("/api/auth/login", { email: creds.studentEmail, password: creds.demoPassword });
      assert.equal(step1.status, 200);
      assert.equal(step1.body.otpRequired, true);
      assert.equal(c.cookie, "", "no session before the code");
      assert.match(step1.body.devCode, /^\d{6}$/);
      const wrong = step1.body.devCode === "000000" ? "111111" : "000000";
      assert.equal((await c.post("/api/auth/login/otp", { challenge: step1.body.challenge, code: wrong })).status, 400);
      assert.equal((await c.post("/api/auth/login/otp/resend", { challenge: step1.body.challenge })).status, 429);
      const ok = await c.post("/api/auth/login/otp", { challenge: step1.body.challenge, code: step1.body.devCode });
      assert.equal(ok.status, 200);
      assert.equal((await c.get("/api/auth/me")).body.user.email, creds.studentEmail);
      // A used challenge cannot be replayed.
      assert.equal((await c.post("/api/auth/login/otp", { challenge: step1.body.challenge, code: step1.body.devCode })).status, 400);
    } finally {
      config.loginOtp = false;
    }
  });

  it("locks the challenge after repeated wrong codes", async () => {
    config.loginOtp = true;
    try {
      const c = new Client();
      const { body } = await c.post("/api/auth/login", { email: creds.studentEmail, password: creds.demoPassword });
      const wrong = body.devCode === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) await c.post("/api/auth/login/otp", { challenge: body.challenge, code: wrong });
      assert.equal((await c.post("/api/auth/login/otp", { challenge: body.challenge, code: body.devCode })).status, 400);
    } finally {
      config.loginOtp = false;
    }
  });
});

describe("notifications", () => {
  it("notifies staff of new requests and members of replies, live over the socket", async () => {
    await student.post("/api/notifications/read-all");
    const socket = connectSocket(base, { path: "/api/socket", extraHeaders: { cookie: student.cookie }, transports: ["websocket"] });
    await new Promise<void>((resolve, reject) => {
      socket.on("connect", () => resolve());
      socket.on("connect_error", reject);
    });
    const live = new Promise<{ title: string }>((resolve) => socket.on("notification", resolve));

    const sent = await student.post("/api/contact", { name: "Ananya", email: "s@example.com", category: "student", type: "training", subject: "GMP training", message: "Do you run GMP training for students?", startedAt: Date.now() - 10_000 });
    assert.equal(sent.status, 201);
    const staff = (await admin.get("/api/notifications")).body;
    assert.ok(staff.unread >= 1);
    assert.match(staff.items[0].title, /training request from Ananya/);
    assert.equal(staff.items[0].link.startsWith("/admin/requests"), true);

    const id = staff.items[0].link.split("open=")[1];
    await admin.patch(`/api/admin/contacts/${id}`, { response: "Yes, the next batch starts in December." });
    assert.match((await live).title, /secretariat replied/);
    socket.close();

    const mine = (await student.get("/api/notifications")).body;
    assert.equal(mine.unread, 1);
    assert.equal((await student.post(`/api/notifications/${mine.items[0]._id}/read`)).body.unread, 0);
    // Members cannot read or mark someone else's notifications.
    await industry.post(`/api/notifications/${staff.items[0]._id}/read`);
    assert.equal((await admin.get("/api/notifications")).body.items[0].readAt, undefined);
  });

  it("rejects sockets without a valid session", async () => {
    const socket = connectSocket(base, { path: "/api/socket", transports: ["websocket"], reconnection: false });
    const err = await new Promise<Error>((resolve) => socket.on("connect_error", resolve));
    assert.match(err.message, /Not signed in/);
    socket.close();
  });

  it("alerts the audience when an announcement is published", async () => {
    const created = await admin.post("/api/admin/contents", { type: "announcement", title: "Students only: lab visit", summary: "A lab visit for student members.", status: "published", access: { visibility: "roles", roles: [String((await Role.findOne({ name: "student" }))!._id)] } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const s = (await student.get("/api/notifications")).body.items[0];
    assert.match(s.title, /Announcement: Students only/);
    assert.match(s.link, /^\/events\/announcements\//);
    const i = (await industry.get("/api/notifications")).body.items;
    assert.equal(i.some((n: { title: string }) => n.title.includes("Students only")), false);
  });
});

describe("review notifications", () => {
  it("asks publishers to review an editor's submission, but not other editors", async () => {
    await admin.post("/api/notifications/read-all");
    const r = await editor.post("/api/admin/contents", { type: "article", title: "Draft for review", summary: "An editor's draft awaiting a publisher.", status: "pending_review" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const n = (await admin.get("/api/notifications?unread=true")).body.items;
    assert.ok(n.some((x: { title: string }) => x.title === "Content to review: Draft for review"));
    assert.equal((await editor.get("/api/notifications?unread=true")).body.items.length, 0);
  });
});

describe("expert audiences", () => {
  it("limits an expert profile to chosen roles, like other content", async () => {
    const studentRole = await Role.findOne({ name: "student" });
    const priya = await User.findOne({ email: "priya.sharma@demo.bian.local" });
    const { Expert } = await import("../src/models/learning.js");
    await Expert.updateOne({ user: priya!._id }, { access: { visibility: "roles", roles: [studentRole!._id], organizations: [] } });
    const id = String((await Expert.findOne({ user: priya!._id }))!._id);
    assert.equal((await anon.get(`/api/experts/${id}`)).status, 404);
    assert.equal((await industry.get(`/api/experts/${id}`)).status, 404);
    assert.equal((await student.get(`/api/experts/${id}`)).status, 200);
    assert.equal((await admin.get(`/api/experts/${id}`)).status, 200);
    assert.ok(!(await industry.get("/api/experts")).body.items.some((e: { _id: string }) => e._id === id));
    await Expert.updateOne({ user: priya!._id }, { access: { visibility: "public", roles: [], organizations: [] } });
  });

  it("lets a member choose an audience for their own profile", async () => {
    const opts = (await industry.get("/api/experts/audience-options")).body;
    assert.ok(opts.roles.length && !opts.roles.some((r: { name: string }) => r.name === "super_admin"));
    const role = opts.roles.find((r: { name: string }) => r.name === "academia");
    const r = await industry.put("/api/experts/me/profile", { headline: "Process scale-up", expertType: "consultant", skills: [], expertiseAreas: [], access: { visibility: "roles", roles: [role._id], organizations: [] } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.access.visibility, "roles");
  });
});

describe("developer console", () => {
  const developer = new Client();
  before(async () => {
    await developer.login("developer@bian.local", creds.developerPassword);
  });
  after(async () => {
    await developer.post("/api/developer/features/reset");
  });

  it("is a flag, not a role, and stays out of member management", async () => {
    const me = (await developer.get("/api/auth/me")).body.user;
    assert.equal(me.isDeveloper, true);
    assert.deepEqual(me.roles, []);
    assert.ok(me.permissions.includes("roles.manage"));
    const roles = (await admin.get("/api/admin/roles")).body.roles;
    assert.ok(!roles.some((r: { name: string }) => /developer/i.test(r.name)));
    const users = (await admin.get("/api/admin/users?q=developer")).body.items;
    assert.equal(users.length, 0);
    const dev = await User.findOne({ email: "developer@bian.local" });
    assert.equal((await admin.patch(`/api/admin/users/${dev!._id}`, { status: "suspended" })).status, 404);
    assert.equal((await admin.get("/api/developer/features")).status, 404);
    assert.equal((await student.get("/api/developer/features")).status, 404);
    assert.equal((await developer.get("/api/developer/features")).status, 200);
  });

  it("switching a feature off disables everything that depends on it", async () => {
    const r = await developer.put("/api/developer/features/contact", { enabled: false, audience: [] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.matrix["experts.connect"].student, { on: false, reason: "off", key: "contact" });
    assert.equal(r.body.matrix["admin.requests"].staff.on, false);
    const flags = (await student.get("/api/features")).body.features;
    assert.equal(flags.contact, false);
    assert.equal(flags["experts.connect"], false);
    assert.equal(flags["partners.enquire"], false);
    assert.equal(flags["dashboard.requests"], false);
    assert.equal(flags.experts, true);
    const msg = { name: "A Person", email: "a@example.com", category: "student", type: "general", message: "Hello there, a question.", startedAt: Date.now() - 10_000 };
    assert.equal((await anon.post("/api/contact", msg)).status, 403);
    assert.equal((await admin.get("/api/admin/contacts")).status, 403);
    assert.equal((await student.get("/api/me/requests")).status, 403);
    // The developer still sees everything.
    assert.equal((await developer.get("/api/features")).body.features.contact, true);
    await developer.put("/api/developer/features/contact", { enabled: true, audience: [] });
    assert.equal((await anon.post("/api/contact", msg)).status, 201);
  });

  it("limits a screen to member categories; staff keep access", async () => {
    await developer.put("/api/developer/features/experts", { enabled: true, audience: ["student", "visitor"] });
    assert.equal((await student.get("/api/experts")).status, 200);
    assert.equal((await anon.get("/api/experts")).status, 200);
    assert.equal((await industry.get("/api/experts")).status, 403);
    assert.equal((await admin.get("/api/experts")).status, 200);
    const flags = (await industry.get("/api/features")).body.features;
    assert.equal(flags["experts.selfProfile"], false);
    const search = (await industry.get("/api/search?q=GMP")).body;
    assert.equal(search.experts.length, 0);
    await developer.put("/api/developer/features/experts", { enabled: true, audience: [] });
  });

  it("filters content screens out of listings and search", async () => {
    await developer.put("/api/developer/features/opportunities", { enabled: false, audience: [] });
    const list = (await student.get("/api/contents?type=opportunity")).body;
    assert.equal(list.items.length, 0);
    const home = (await anon.get("/api/home")).body;
    assert.equal(home.opportunities.length, 0);
    assert.equal((await admin.get("/api/admin/contents?type=opportunity")).body.items.length, 0);
    await developer.put("/api/developer/features/opportunities", { enabled: true, audience: [] });
  });

  it("closes registration and hides developer changes from the admin audit log", async () => {
    await developer.put("/api/developer/features/registration", { enabled: false, audience: [] });
    const reg = await anon.post("/api/auth/register", { category: "student", name: "Late Joiner", email: "late@example.com", password: "LateJoiner123", acceptTerms: true });
    assert.equal(reg.status, 403);
    await developer.put("/api/developer/features/registration", { enabled: true, audience: [] });
    const audit = (await admin.get("/api/admin/audit")).body;
    assert.ok(!audit.items.some((a: { entityType: string }) => a.entityType === "FeatureSetting"));
    assert.ok((await developer.get("/api/developer/overview")).body.history.length > 0);
  });

  it("switches publishing statuses, page-builder blocks and admin tools off", async () => {
    await developer.put("/api/developer/features/publishing.drafts", { enabled: false, audience: [] });
    const draft = await admin.post("/api/admin/contents", { type: "article", title: "Workflow switch check", status: "draft", access: { visibility: "public" } });
    assert.equal(draft.status, 400);
    const live = await admin.post("/api/admin/contents", {
      type: "article", title: "Workflow switch check", status: "published", access: { visibility: "public" },
      blocks: [{ type: "heading", data: { text: "Hello", level: 2 } }, { type: "cta", data: { title: "Join", label: "Go", href: "/register" } }],
    });
    assert.equal(live.status, 201);
    await developer.put("/api/developer/features/publishing.drafts", { enabled: true, audience: [] });

    // Review off: no pending-review status, and members can no longer submit opportunities.
    await developer.put("/api/developer/features/publishing.review", { enabled: false, audience: [] });
    assert.equal((await admin.put(`/api/admin/contents/${live.body._id}`, { type: "article", title: "Workflow switch check", status: "pending_review" })).status, 400);
    assert.equal((await industry.get("/api/features")).body.features["opportunities.post"], false);
    await developer.put("/api/developer/features/publishing.review", { enabled: true, audience: [] });

    // Block types: switched-off blocks are left out of the page.
    await developer.put("/api/developer/features/blocks.cta", { enabled: false, audience: [] });
    const page = (await anon.get(`/api/contents/by-slug/knowledge/${live.body.slug}`)).body;
    assert.deepEqual(page.blocks.map((b: { type: string }) => b.type), ["heading"]);
    await developer.put("/api/developer/features/blocks.cta", { enabled: true, audience: [] });

    // Admin tools.
    await developer.put("/api/developer/features/admin.exports", { enabled: false, audience: [] });
    assert.equal((await admin.get("/api/admin/users/export.csv")).status, 403);
    await developer.put("/api/developer/features/admin.analytics", { enabled: false, audience: [] });
    const stats = (await admin.get("/api/admin/stats")).body;
    assert.equal(stats.analytics, false);
    assert.equal(stats.membershipGrowth, undefined);
    assert.equal(typeof stats.pendingApprovals, "number");
    await developer.post("/api/developer/features/reset");
    await admin.del(`/api/admin/contents/${live.body._id}`);
  });

  it("rejects unknown features and audiences", async () => {
    assert.equal((await developer.put("/api/developer/features/nope", { enabled: false })).status, 404);
    assert.equal((await developer.put("/api/developer/features/experts", { enabled: true, audience: ["martians"] })).status, 400);
  });
});
