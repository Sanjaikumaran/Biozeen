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
