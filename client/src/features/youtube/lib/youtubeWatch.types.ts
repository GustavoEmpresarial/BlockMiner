export type TrackerColor = 'primary' | 'emerald' | 'amber' | 'blue';

export type YoutubeDailyReset = {
  localDate?: string;
  nextResetInMs?: number | null;
};

export type YoutubeStatsPayload = Record<string, unknown>;
export type YoutubeStatusPayload = Record<string, unknown>;
