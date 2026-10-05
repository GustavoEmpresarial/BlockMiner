import { useState, useEffect, useCallback } from 'react';
import { Youtube, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Card from '../../../shared/components/Card';
import IconBadge from '../../../shared/components/IconBadge';
import { api } from '../../../shared/auth/auth.store';
import { VideoCard } from './socialTab.shared';
import type { FeedResponse } from './socialTab.shared';

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
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
        <div className="flex items-center gap-3">
          <IconBadge icon={Youtube} variant="red" size="lg" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">{t('ranking.social.feed_title')}</h1>
            <p className="text-slate-400 text-xs sm:text-sm font-medium">{t('ranking.social.feed_subtitle')}</p>
          </div>
        </div>
        {videoCountLabel ? (
          <span className="text-[10px] text-slate-300 font-black uppercase tracking-wider font-mono">{videoCountLabel}</span>
        ) : null}
      </div>

      {loadingFeed ? (
        <Card className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-red-400" />
        </Card>
      ) : !feed?.entries?.length ? (
        <Card className="flex flex-col items-center justify-center py-16 gap-3 text-slate-300">
          <Youtube className="w-10 h-10 text-red-400" />
          <p className="text-sm font-bold">{t('ranking.social.no_videos')}</p>
        </Card>
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
                className="p-2 rounded-xl bg-slate-900 border-2 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[2px_2px_0px_#000000] outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-300 font-black font-mono">
                {page} / {feed.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(feed.totalPages, p + 1))}
                disabled={page >= feed.totalPages}
                className="p-2 rounded-xl bg-slate-900 border-2 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[2px_2px_0px_#000000] outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
