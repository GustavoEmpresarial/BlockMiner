import { useEffect } from 'react';

export function useDocumentTitleCountdown(
  active: boolean,
  remainingSec: number,
  baseTitle: string,
): void {
  useEffect(() => {
    if (!active) return;
    const prev = document.title;
    document.title = `${Math.max(0, Math.ceil(remainingSec))}s · ${baseTitle}`;
    return () => {
      document.title = prev;
    };
  }, [active, remainingSec, baseTitle]);
}
