/** Error codes for the youtube module. */
export const YOUTUBE_ERROR = Object.freeze({
  MISSING_VIDEO_ID: "missing_video_id",
  INSUFFICIENT_WATCH_TIME: "insufficient_watch_time",
  DAILY_LIMIT_REACHED: "daily_limit_reached",
  CLAIM_FAILED: "claim_failed",
});

export class YoutubeClaimError extends Error {
  constructor(public readonly code: "INSUFFICIENT_BALANCE") {
    super(code);
    this.name = "YoutubeClaimError";
  }
}
