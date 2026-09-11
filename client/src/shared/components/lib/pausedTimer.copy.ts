import i18n from "../../../i18n/config";

export type PausedTimerContext = "shortlink" | "youtube" | "autoMining" | "generic";

export const pausedTimerCopy = {
  get title() {
    return i18n.t("common.paused_timer.title");
  },
  get dismiss() {
    return i18n.t("common.paused_timer.dismiss");
  },
} as const;

export function pausedTimerMessage(context: PausedTimerContext): string {
  const key =
    context === "shortlink"
      ? "common.paused_timer.shortlink_message"
      : context === "youtube"
        ? "common.paused_timer.youtube_message"
        : context === "autoMining"
          ? "common.paused_timer.autoMining_message"
          : "common.paused_timer.generic_message";
  return i18n.t(key);
}
