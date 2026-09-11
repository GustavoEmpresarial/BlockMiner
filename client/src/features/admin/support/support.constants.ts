/** Default page size for GET `/admin/public-support/tickets` (server `adminListPublicTickets`). */
export const ADMIN_PUBLIC_SUPPORT_TICKETS_PAGE_SIZE = 30;

/** Max image size for POST `/admin/upload-image` (server media module, 5 MB). */
export const ADMIN_SUPPORT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** Max attachments per admin support reply (server `support.payload`). */
export const ADMIN_SUPPORT_REPLY_MAX_ATTACHMENTS = 5;

/** Allowed MIME types for support image uploads (server media + public support). */
export const ADMIN_SUPPORT_ALLOWED_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;
