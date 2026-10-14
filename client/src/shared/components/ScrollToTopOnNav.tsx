import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Opens every route at the top. The user shell scrolls the window, the admin shell
 * scrolls its own <main data-route-scroll>, so both are reset. Links with a #hash keep
 * their anchor jump.
 */
export default function ScrollToTopOnNav() {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  useLayoutEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.querySelectorAll<HTMLElement>('[data-route-scroll]').forEach((el) => {
      el.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
  }, [pathname, hash]);

  return null;
}
