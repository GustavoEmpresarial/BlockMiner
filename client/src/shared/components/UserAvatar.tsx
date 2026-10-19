import { useEffect, useState } from 'react';

/** Only server-issued avatar paths are rendered (never an arbitrary URL from a payload). */
export function isSafeAvatarUrl(url: unknown): url is string {
  return typeof url === 'string' && /^\/media\/avatars\/[a-f0-9]{32}\.webp$/.test(url);
}

export function avatarInitial(name: string | null | undefined): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

type Props = {
  url?: string | null;
  name?: string | null;
  /** Classes for the box (size, radius, border, background). */
  className?: string;
  /** Classes for the initial letter. */
  letterClassName?: string;
};

/** Profile photo when the user has an active license, otherwise their initial. */
export default function UserAvatar({ url, name, className = 'h-8 w-8 rounded-full', letterClassName = 'text-xs font-black text-white' }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const showImage = isSafeAvatarUrl(url) && !failed;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`} data-testid="user-avatar">
      {showImage ? (
        <img
          src={url}
          alt={name ? `${name}` : ''}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={letterClassName} aria-hidden={Boolean(name)}>
          {avatarInitial(name)}
        </span>
      )}
    </span>
  );
}
