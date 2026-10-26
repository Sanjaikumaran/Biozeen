import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import multer from "multer";
import { config } from "./config.js";
import { HttpError } from "./lib/http.js";
import { loadUser } from "./middleware/auth.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { adminContactsRouter, contactRouter } from "./routes/contacts.js";
import { adminContentsRouter, contentsRouter } from "./routes/contents.js";
import { adminCoursesRouter, coursesRouter } from "./routes/courses.js";
import { adminDirectoryRouter, expertsRouter, partnersRouter } from "./routes/directory.js";
import { adminEventsRouter, eventsRouter } from "./routes/events.js";
import { adminFeedbackRouter, feedbackRouter } from "./routes/feedback.js";
import { adminMediaRouter, mediaRouter } from "./routes/media.js";
import { meRouter, publicRouter } from "./routes/public.js";
import { notificationsRouter } from "./routes/notifications.js";
import { developerRouter, featuresRouter } from "./routes/developer.js";

export const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
app.use(cors({ origin: config.clientOrigins, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());

/**
 * CSRF defence: session cookies are SameSite=Lax, and state-changing requests must
 * originate from a configured client origin when the browser sends an Origin header.
 */
app.use((req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (origin && !config.clientOrigins.includes(origin)) throw new HttpError(403, "Request origin not allowed");
  next();
});

// Never let browsers or proxies cache API responses that may contain restricted data.
app.use("/api", (req, res, next) => {
  if (!req.path.startsWith("/media/")) res.setHeader("Cache-Control", "no-store");
  next();
});

app.use(loadUser);

app.get("/api/health", (_req, res) => {
  res.json({ message: "Biozeen API is running", db: mongoose.connection.readyState === 1 ? "up" : "down" });
});

app.use("/api/auth", authRouter);
app.use("/api", publicRouter);
app.use("/api/me", meRouter);
app.use("/api/contents", contentsRouter);
app.use("/api/courses", coursesRouter);
app.use("/api/events", eventsRouter);
app.use("/api/partners", partnersRouter);
app.use("/api/experts", expertsRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/contact", contactRouter);
app.use("/api/media", mediaRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/features", featuresRouter);
app.use("/api/developer", developerRouter);

app.use("/api/admin/contents", adminContentsRouter);
app.use("/api/admin/courses", adminCoursesRouter);
app.use("/api/admin/events", adminEventsRouter);
app.use("/api/admin/directory", adminDirectoryRouter);
app.use("/api/admin/feedback", adminFeedbackRouter);
app.use("/api/admin/contacts", adminContactsRouter);
app.use("/api/admin/media", adminMediaRouter);
app.use("/api/admin", adminRouter);

app.use("/api", (_req, _res, next) => next(new HttpError(404, "Endpoint not found")));

// Serve the built client in production when it sits alongside the server.
const clientDist = path.resolve("../client/dist");
if (config.isProd && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: "1h" }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? `Files must be under ${config.maxUploadBytes / 1024 / 1024} MB` : "Upload failed";
    return res.status(400).json({ error: message });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    return res.status(400).json({ error: "Please correct the highlighted fields", details });
  }
  if (err instanceof mongoose.Error.CastError) return res.status(400).json({ error: "Invalid identifier" });
  if ((err as { code?: number })?.code === 11000) return res.status(409).json({ error: "A record with these details already exists" });
  if ((err as { type?: string })?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed request body" });
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});
