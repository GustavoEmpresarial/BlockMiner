import { isAxiosError, type AxiosInstance } from "axios";
import { reportApiFailureViaTelemetry } from "./clientErrorTelemetry";

let installed = false;

/**
 * Report unexpected axios /api failures once per instance.
 * Expected 4xx / infra codes are dropped inside clientErrorTelemetry.
 */
export function installAxiosClientErrorReporting(api: AxiosInstance): void {
  if (installed) return;
  installed = true;

  api.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      try {
        if (!isAxiosError(error)) return Promise.reject(error);
        const url = String(error.config?.url || "");
        if (/track\/client-error/.test(url)) return Promise.reject(error);

        const method = String(error.config?.method || "get").toLowerCase();
        const status = error.response?.status;
        const data = error.response?.data;
        const code =
          data && typeof data === "object" && typeof (data as { code?: unknown }).code === "string"
            ? (data as { code: string }).code
            : undefined;
        const businessMsg =
          data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string"
            ? (data as { message: string }).message
            : undefined;

        reportApiFailureViaTelemetry(
          {
            operation: `axios_${method}`,
            message: businessMsg || error.message || `Request failed with status code ${status ?? "?"}`,
            statusCode: status,
            code,
          },
          error,
        );
      } catch {
        /* never break the reject chain */
      }
      return Promise.reject(error);
    },
  );
}
