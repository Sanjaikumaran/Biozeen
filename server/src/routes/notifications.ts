import { Router } from "express";
import { oid } from "../lib/http.js";
import { requireAuth } from "../middleware/auth.js";
import { Notification } from "../models/admin.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const filter = { user: req.user!._id, ...(req.query.unread === "true" ? { readAt: null } : {}) };
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ user: req.user!._id, readAt: null }),
  ]);
  res.json({ items, unread });
});

notificationsRouter.post("/read-all", async (req, res) => {
  await Notification.updateMany({ user: req.user!._id, readAt: null }, { readAt: new Date() });
  res.json({ unread: 0 });
});

notificationsRouter.post("/:id/read", async (req, res) => {
  await Notification.updateOne({ _id: oid(String(req.params.id)), user: req.user!._id, readAt: null }, { readAt: new Date() });
  res.json({ unread: await Notification.countDocuments({ user: req.user!._id, readAt: null }) });
});
