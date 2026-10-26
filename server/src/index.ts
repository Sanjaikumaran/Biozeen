import fs from "node:fs";
import { createServer } from "node:http";
import mongoose from "mongoose";
import { app } from "./app.js";
import { config } from "./config.js";
import { hasExport, importData } from "./db-transfer.js";
import { mailStatus } from "./lib/mailer.js";
import { attachRealtime } from "./lib/realtime.js";
import { User } from "./models/identity.js";
import { ensureDeveloper, runMigrations } from "./maintenance.js";
import { seed } from "./seed.js";

/** A new machine starts with an empty database: load the shared export, or the sample data. */
async function initEmptyDatabase() {
  if (!config.autoInitDb || (await User.exists({}))) return;
  if (hasExport()) {
    const m = await importData();
    console.log(`Empty database initialised from ${config.dataDir} (export of ${m.exportedAt}).`);
  } else {
    await seed();
    console.log("Empty database initialised with sample data (no export in db/data).");
  }
}

async function startServer(): Promise<void> {
  await mongoose.connect(config.mongoUri);
  await mongoose.syncIndexes();
  console.log("MongoDB connected");
  fs.mkdirSync(config.uploadDir, { recursive: true });
  await initEmptyDatabase();
  await runMigrations();
  await ensureDeveloper();
  const server = createServer(app);
  attachRealtime(server);
  server.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`);
    console.log(`Email: ${mailStatus()}. Sign-in codes: ${config.loginOtp ? "on" : "off"}.`);
    if (config.loginOtp && !config.email.enabled) {
      console.warn("LOGIN_OTP_ENABLED is on but EMAIL_ENABLED is off: sign-in codes are only written to this log.");
    }
  });
}

startServer().catch((error: unknown) => {
  console.error("Server startup failed:", error);
  process.exitCode = 1;
});
