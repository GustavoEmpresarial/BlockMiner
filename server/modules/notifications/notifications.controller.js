import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import * as notificationsService from "./notifications.service.js";
const log = logger.child("notifications.controller");
export async function getNotifications(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const notifications = await notificationsService.listNotificationsForUser(user.id);
        res.json({ ok: true, notifications });
    }
    catch (error) {
        log.error("Failed to fetch notifications", { error: String(error) });
        res.status(500).json({ ok: false, message: "Error fetching notifications" });
    }
}
export async function markAsRead(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        await notificationsService.markNotificationAsRead(user.id, String(req.params.id ?? ""));
        res.json({ ok: true });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg === "INVALID_ID") {
            res.status(400).json({ ok: false, message: "Invalid notification id." });
            return;
        }
        log.error("Failed to mark notification as read", { error: msg });
        res.status(500).json({ ok: false, message: "Error updating notification" });
    }
}
