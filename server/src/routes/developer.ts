import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { config } from "../config.js";
import { audit } from "../lib/audit.js";
import { AUDIENCES, FEATURES, FEATURE_KEYS, allowedFeatures, featureMap, invalidateFeatures, resolve, type Audience } from "../lib/features.js";
import { HttpError, parse } from "../lib/http.js";
import { mailStatus } from "../lib/mailer.js";
import { broadcast } from "../lib/realtime.js";
import { requireDeveloper } from "../middleware/auth.js";
import { AuditLog, FeatureSetting } from "../models/admin.js";
import { User } from "../models/identity.js";

/** GET /api/features: what the current viewer may use. Public; drives the client's screens and actions. */
export const featuresRouter = Router();
featuresRouter.get("/", async (req, res) => {
  res.json({ features: await allowedFeatures(req.user) });
});

export const developerRouter = Router();
developerRouter.use(requireDeveloper);

async function snapshot() {
  const map = await featureMap();
  const settings = Object.fromEntries(FEATURES.map((f) => [f.key, map.get(f.key) ?? { enabled: true, audience: [] }]));
  // Effective state per audience (and for staff), so the console can show the chain's effect.
  const matrix = Object.fromEntries(
    FEATURES.map((f) => [f.key, Object.fromEntries([...AUDIENCES, "staff"].map((a) => [a, resolve(map, f.key, a === "staff" ? null : (a as Audience))]))]),
  );
  return { features: FEATURES, audiences: AUDIENCES, settings, matrix };
}

developerRouter.get("/features", async (_req, res) => {
  res.json(await snapshot());
});

const settingInput = z.object({
  enabled: z.boolean(),
  audience: z.array(z.enum(AUDIENCES)).max(AUDIENCES.length).default([]),
});

async function save(key: string, data: z.infer<typeof settingInput>, userId: unknown) {
  // An audience naming every option is the same as no limit.
  const audience = data.audience.length >= AUDIENCES.length ? [] : [...new Set(data.audience)];
  await FeatureSetting.updateOne({ key }, { $set: { enabled: data.enabled, audience, updatedBy: userId } }, { upsert: true });
}

function changed() {
  invalidateFeatures();
  broadcast("features:changed");
}

developerRouter.put("/features/:key", async (req, res) => {
  const key = String(req.params.key);
  if (!FEATURE_KEYS.has(key)) throw new HttpError(404, "Unknown feature");
  const data = parse(settingInput, req.body);
  const before = (await featureMap()).get(key);
  await save(key, data, req.user!._id);
  changed();
  const label = FEATURES.find((f) => f.key === key)!.label;
  await audit(req, "feature.update", "FeatureSetting", null, `${label}: ${data.enabled ? "on" : "off"}${data.audience.length ? ` for ${data.audience.join(", ")}` : ""}`, { key, before, after: data });
  res.json(await snapshot());
});

/** Replace every setting at once (import, or applying a saved configuration). */
developerRouter.put("/features", async (req, res) => {
  const { settings } = parse(z.object({ settings: z.record(z.string(), settingInput) }), req.body);
  const unknown = Object.keys(settings).filter((k) => !FEATURE_KEYS.has(k));
  if (unknown.length) throw new HttpError(400, `Unknown features: ${unknown.join(", ")}`);
  await FeatureSetting.deleteMany({});
  for (const [key, s] of Object.entries(settings)) if (!s.enabled || s.audience.length) await save(key, s, req.user!._id);
  changed();
  await audit(req, "feature.import", "FeatureSetting", null, `Applied a feature configuration (${Object.keys(settings).length} settings)`);
  res.json(await snapshot());
});

developerRouter.post("/features/reset", async (req, res) => {
  await FeatureSetting.deleteMany({});
  changed();
  await audit(req, "feature.reset", "FeatureSetting", null, "Reset every feature to on for everyone");
  res.json(await snapshot());
});

developerRouter.get("/overview", async (_req, res) => {
  const db = mongoose.connection.db!;
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
  const counts = Object.fromEntries(await Promise.all(collections.map(async (c) => [c, await db.collection(c).estimatedDocumentCount()] as const)));
  const [developers, history, map] = await Promise.all([
    User.find({ isDeveloper: true }).select("name email lastLoginAt createdAt").lean(),
    AuditLog.find({ entityType: "FeatureSetting" }).sort({ at: -1 }).limit(15).lean(),
    featureMap(),
  ]);
  res.json({
    environment: {
      nodeEnv: process.env.NODE_ENV ?? "development",
      node: process.version,
      email: mailStatus(),
      loginOtp: config.loginOtp,
      requireApproval: config.requireApproval,
      requireEmailVerification: config.requireEmailVerification,
      autoInitDb: config.autoInitDb,
      appUrl: config.appUrl,
    },
    features: { total: FEATURES.length, off: [...map.values()].filter((s) => !s.enabled).length, limited: [...map.values()].filter((s) => s.enabled && s.audience.length).length },
    collections: counts,
    developers,
    history,
  });
});
