import { useState, useEffect, useCallback } from 'react';
import { Youtube, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../shared/auth/auth.store';
import { VideoCard } from './socialTab.shared';
import type { FeedEntry, FeedResponse } from './socialTab.shared';

export default function SocialTab() {
  const { t } = useTranslation();
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loadingFeed, setLoadingFeed] = useState(true);

  const loadFeed = useCallback(async (p: number) => {
    setLoadingFeed(true);
    try {
      const res = await api.get<FeedResponse>(`/social/feed?page=${p}`);
      if (res.data.ok) setFeed(res.data);
    } catch {
      /* silent */
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  useEffect(() => {
    void loadFeed(page);
  }, [page, loadFeed]);

  const videoCountLabel =
    feed != null
      ? t('ranking.social.video_count', { count: feed.total })
      : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center">
          <Youtube className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <p className="text-sm font-black text-white">{t('ranking.social.feed_title')}</p>
          <p className="text-[10px] text-gray-500">{t('ranking.social.feed_subtitle')}</p>
        </div>
        {videoCountLabel ? (
          <span className="ml-auto text-[10px] text-gray-600 font-bold">{videoCountLabel}</span>
        ) : null}
      </div>

      {loadingFeed ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : !feed?.entries?.length ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
          <Youtube className="w-10 h-10 opacity-30" />
          <p className="text-sm font-bold">{t('ranking.social.no_videos')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {feed.entries.map((e) => (
              <VideoCard
                key={e.id}
                entry={e}
                onVoted={(next) => {
                  setFeed((prev) =>
                    prev
                      ? {
                          ...prev,
                          entries: prev.entries.map((row) =>
                            row.id === next.id
                              ? {
                                  ...row,
                                  likeCount: next.likeCount,
                                  dislikeCount: next.dislikeCount,
                                  myVote: next.myVote,
                                }
                              : row,
                          ),
                        }
                      : prev,
                  );
                }}
              />
            ))}
          </div>

          {feed.totalPages > 1 ? (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-xl bg-white/5 border border-white/8 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-500 font-bold">
                {page} / {feed.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(feed.totalPages, p + 1))}
                disabled={page >= feed.totalPages}
                className="p-2 rounded-xl bg-white/5 border border-white/8 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
