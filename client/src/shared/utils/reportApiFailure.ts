import {
  reportApiFailureViaTelemetry,
  type ReportApiFailureArgs,
} from "./clientErrorTelemetry";

export type { ReportApiFailureArgs };

/**
 * Best-effort POST to /api/track/client-error. Never throws — telemetry must
 * not break the product flow that just failed.
 * Client + server drop infra / expected UX noise from the admin list.
 */
export function reportApiFailure(args: ReportApiFailureArgs, err?: unknown): void {
  reportApiFailureViaTelemetry(args, err);
}
