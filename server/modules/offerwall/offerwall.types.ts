export type OfferwallAnalyticsParams = {
  userId: number | null;
  from: Date;
  to: Date;
  serverNow: string;
};

export type SanitizeDateRangeResult =
  | { ok: true; range: { from: Date; to: Date; serverNow: string } }
  | { ok: false; message: string };

export type OfferwallDailyBucket = {
  day: string;
  dayBrt: string;
  internal: number;
  internalPol: number;
  offerwallMe: number;
  offerwallMePol: number;
  multiwall: number;
  multiwallPol: number;
  offerwallGg: number;
  offerwallGgPol: number;
  zeradsCallbacks: number;
  zeradsClicks: number;
  zeradsPol: number;
};

export type OfferwallTotals = {
  internal: { count: number; pol: number };
  offerwallMe: { count: number; pol: number };
  multiwall: { count: number; pol: number };
  offerwallGg: { count: number; pol: number };
  zerads: {
    callbacks: number;
    clicks: number;
    pol: number;
  };
};

export type OfferwallAnalyticsReport = {
  from: string;
  to: string;
  serverNow: string;
  serverNowBrt: string;
  userId: number | null;
  scoringConfig: Record<string, unknown>;
  totals: OfferwallTotals;
  daily: OfferwallDailyBucket[];
};

export type FetchOfferwallRawFilter = {
  userId?: number | null;
  from: Date;
  to: Date;
};
