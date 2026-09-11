/** Ported from legacy/server/modules/notifications/notification.routes.ts */
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import * as ctrl from "./notifications.controller.js";
export const notificationsRouter = express.Router();
notificationsRouter.get("/", requireAuth, ctrl.getNotifications);
notificationsRouter.post("/read/:id", requireAuth, ctrl.markAsRead);
