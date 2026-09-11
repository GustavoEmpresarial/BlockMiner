export type OfferwallAnalyticsParams = {
  userId: number | null;
  from: Date;
  to: Date;
  serverNow: string;
};

export type SanitizeDateRangeResult =
  | { ok: true; range: { from: Date; to: Date; serverNow: string } }
  | { ok: false; message: string };
