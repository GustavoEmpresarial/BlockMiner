export function getRequestIp(req) {
    const xReal = req.headers["x-real-ip"];
    if (typeof xReal === "string" && xReal.trim())
        return xReal.trim();
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.trim())
        return xff.split(",")[0].trim();
    return req.ip || req.socket?.remoteAddress || "unknown";
}
export const getClientIp = getRequestIp;
