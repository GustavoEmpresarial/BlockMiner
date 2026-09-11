/** Public surface of the youtube module (watch-to-earn hash-rate boost mechanic). */
export { youtubeRouter } from "./youtube.routes.js";
export { YOUTUBE_ERROR } from "./youtube.errors.js";
export type {
  YoutubeStatusResult,
  YoutubeStatsResult,
  YoutubeClaimResult,
  YoutubeDailyResetMeta,
} from "./youtube.types.js";
