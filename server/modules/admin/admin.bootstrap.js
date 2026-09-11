import { logger } from "../../core/logger/index.js";
import { findAdminByEmail, createAdmin } from "./admin.service.js";
const log = logger.child("AdminBootstrap");
function readBootstrapAdmins() {
    const enabled = String(process.env.ADMIN_BOOTSTRAP_ENABLED ?? "").trim().toLowerCase();
    if (enabled !== "true" && enabled !== "1")
        return [];
    const admins = [];
    let i = 1;
    for (;;) {
        const name = String(process.env[`ADMIN_${i}_NAME`] ?? "").trim();
        const email = String(process.env[`ADMIN_${i}_EMAIL`] ?? "").trim().toLowerCase();
        const password = String(process.env[`ADMIN_${i}_PASSWORD`] ?? "").trim();
        const role = String(process.env[`ADMIN_${i}_ROLE`] ?? "admin").trim();
        if (!name && !email)
            break;
        if (name && email && password)
            admins.push({ name, email, password, role });
        i += 1;
        if (i > 20)
            break;
    }
    return admins;
}
/** Called once at process boot (see bootstrap/server.ts). Creates env-declared
 * admin users idempotently — skips any email that already exists. */
export async function bootstrapAdminUsers() {
    const candidates = readBootstrapAdmins();
    if (candidates.length === 0)
        return;
    for (const candidate of candidates) {
        try {
            const existing = await findAdminByEmail(candidate.email);
            if (existing) {
                log.info("AdminBootstrap: skipping existing admin", { email: candidate.email });
                continue;
            }
            await createAdmin({ name: candidate.name, email: candidate.email, password: candidate.password, role: candidate.role });
            log.info("AdminBootstrap: created admin", { email: candidate.email, role: candidate.role });
        }
        catch (err) {
            log.error("AdminBootstrap: failed to create admin", {
                email: candidate.email,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
}
