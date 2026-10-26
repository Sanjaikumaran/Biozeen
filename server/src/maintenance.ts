import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { config } from "./config.js";
import { User } from "./models/identity.js";

/**
 * Idempotent data upgrades, run on every start and after an import, so older exports keep working.
 * Experts used visibility public/members/hidden; they now use the shared audience model.
 */
export async function runMigrations() {
  const experts = mongoose.connection.db!.collection("experts");
  const res = await experts.updateMany({ visibility: { $exists: true } }, [
    {
      $set: {
        access: {
          visibility: { $switch: { branches: [{ case: { $eq: ["$visibility", "public"] }, then: "public" }, { case: { $eq: ["$visibility", "hidden"] }, then: "private" }], default: "authenticated" } },
          roles: [],
          organizations: [],
        },
      },
    },
    { $unset: "visibility" },
  ]);
  if (res.modifiedCount) console.log(`Migrated ${res.modifiedCount} expert profiles to audience settings.`);

  // Requests handled before firstResponseAt existed take it from their first audit-log update.
  const db = mongoose.connection.db!;
  const pending = await db.collection("contactRequests").find({ status: { $ne: "new" }, firstResponseAt: { $exists: false } }).project({ _id: 1, updatedAt: 1 }).toArray();
  for (const r of pending) {
    const first = await db.collection("auditLogs").find({ entityType: "ContactRequest", entityId: r._id, action: "contact.update" }).sort({ at: 1 }).limit(1).next();
    await db.collection("contactRequests").updateOne({ _id: r._id }, { $set: { firstResponseAt: first?.at ?? r.updatedAt } });
  }
  if (pending.length) console.log(`Recorded first-response times for ${pending.length} earlier requests.`);
}

/**
 * Creates the developer account named by DEVELOPER_EMAIL / DEVELOPER_PASSWORD when it doesn't exist.
 * An existing ordinary account with that email is never promoted, so registering first can't claim it.
 */
export async function ensureDeveloper() {
  const { email, password } = config.developer;
  if (!email || !password) return;
  const existing = await User.findOne({ email }).select("isDeveloper").lean();
  if (existing) {
    if (!existing.isDeveloper) console.warn(`DEVELOPER_EMAIL ${email} belongs to an ordinary account; it was not given developer access.`);
    return;
  }
  await User.create({
    email,
    name: "Platform Developer",
    passwordHash: await bcrypt.hash(password, 12),
    accountType: "individual",
    category: "other",
    status: "active",
    emailVerified: true,
    isDeveloper: true,
    roles: [],
  });
  console.log(`Developer account created: ${email}`);
}
