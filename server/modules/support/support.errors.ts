export const SUPPORT_ERROR = {
  NOT_FOUND: "NOT_FOUND",
  MEDIA_UPLOAD_NOT_PORTED: "MEDIA_UPLOAD_NOT_PORTED",
  DOSSIER_NOT_PORTED: "DOSSIER_NOT_PORTED",
} as const;

export class SupportNotFoundError extends Error {
  readonly code = SUPPORT_ERROR.NOT_FOUND;
  constructor(message = "NOT_FOUND") {
    super(message);
    this.name = "SupportNotFoundError";
  }
}
