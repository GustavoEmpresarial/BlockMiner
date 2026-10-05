import { useState } from 'react';
import { ExternalLink, ThumbsDown, ThumbsUp, Youtube } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api, useAuthStore } from '../../../shared/auth/auth.store';
import Card from '../../../shared/components/Card';
import { ChannelAvatar } from '../../creator/components/ChannelAvatar';

export type FeedEntry = {
  id: number;
  videoId: string;
  videoUrl: string;
  title: string | null;
  likeCount: number;
  dislikeCount: number;
  myVote: 1 | -1 | 0;
  profile: { channelName: string; channelPhoto: string | null; channelUrl?: string | null };
};

export type FeedResponse = {
  ok?: boolean;
  entries: FeedEntry[];
  total: number;
  totalPages: number;
  page: number;
};

export type VotePatch = Pick<FeedEntry, 'id' | 'likeCount' | 'dislikeCount' | 'myVote'>;

export function VideoCard({
  entry,
  onVoted,
}: {
  entry: FeedEntry;
  onVoted: (next: VotePatch) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [busy, setBusy] = useState(false);

  const vote = async (value: 1 | -1) => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const res = await api.post<{
        ok?: boolean;
        likeCount?: number;
        dislikeCount?: number;
        myVote?: 1 | -1 | 0;
      }>(`/social/videos/${entry.id}/vote`, { value });
      if (res.data?.ok && res.data.likeCount != null && res.data.dislikeCount != null) {
        onVoted({
          id: entry.id,
          likeCount: res.data.likeCount,
          dislikeCount: res.data.dislikeCount,
          myVote: (res.data.myVote ?? 0) as 1 | -1 | 0,
        });
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="table" className="flex flex-col group">
      <a
        href={entry.videoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block overflow-hidden aspect-video"
      >
        <img
          src={`https://img.youtube.com/vi/${entry.videoId}/hqdefault.jpg`}
          alt={entry.title ?? t('ranking.social.video_alt')}
          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300"
        />
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center shadow-[2px_2px_0px_#000000]">
            <Youtube className="w-5 h-5 text-slate-950 fill-slate-950" />
          </div>
        </div>
      </a>
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ChannelAvatar photo={entry.profile.channelPhoto} name={entry.profile.channelName} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-white truncate leading-snug line-clamp-2">
              {entry.title ?? t('ranking.social.video_of', { name: entry.profile.channelName })}
            </p>
            <p className="text-[10px] text-slate-400 truncate">{entry.profile.channelName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-auto flex-wrap">
          <button
            type="button"
            disabled={!user || busy}
            onClick={() => void vote(1)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black uppercase border-2 transition-colors disabled:cursor-not-allowed shadow-[1px_1px_0px_#000000] ${
              entry.myVote === 1
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-slate-700 bg-slate-950 text-slate-300 hover:text-white hover:border-slate-500'
            } ${!user || busy ? 'opacity-70' : ''}`}
          >
            <ThumbsUp className="w-3.5 h-3.5" /> {entry.likeCount}
          </button>
          <button
            type="button"
            disabled={!user || busy}
            onClick={() => void vote(-1)}
            aria-label={t('ranking.social.dislike')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black uppercase border-2 transition-colors disabled:cursor-not-allowed shadow-[1px_1px_0px_#000000] ${
              entry.myVote === -1
                ? 'border-red-500/40 bg-red-500/15 text-red-300'
                : 'border-slate-700 bg-slate-950 text-slate-300 hover:text-white hover:border-slate-500'
            } ${!user || busy ? 'opacity-70' : ''}`}
          >
            <ThumbsDown className="w-3.5 h-3.5" /> {entry.dislikeCount}
          </button>
          {entry.profile.channelUrl ? (
            <a
              href={entry.profile.channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider bg-red-500 hover:bg-red-400 text-slate-950 shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t('ranking.social.visit_channel')}
            </a>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
