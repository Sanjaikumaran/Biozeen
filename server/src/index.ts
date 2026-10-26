import fs from "node:fs";
import mongoose from "mongoose";
import { app } from "./app.js";
import { config } from "./config.js";

async function startServer(): Promise<void> {
  await mongoose.connect(config.mongoUri);
  await mongoose.syncIndexes();
  console.log("MongoDB connected");
  fs.mkdirSync(config.uploadDir, { recursive: true });
  app.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`);
  });
}

startServer().catch((error: unknown) => {
  console.error("Server startup failed:", error);
  process.exitCode = 1;
});
