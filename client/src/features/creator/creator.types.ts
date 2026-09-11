export type YoutuberProfile = {
  id?: number;
  channelName?: string;
  channelPhoto?: string | null;
  channelUrl?: string | null;
  bio?: string | null;
  isCredentialed?: boolean;
  credentialRequestStatus?: 'pending' | 'rejected' | null;
  credentialRejectNote?: string | null;
};

export type Submission = {
  id: number;
  videoId: string;
  videoUrl: string;
  title?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote?: string | null;
  rewardGranted?: boolean;
};
