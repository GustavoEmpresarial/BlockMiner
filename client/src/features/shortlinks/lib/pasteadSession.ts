export const PASTEAD_TOKEN_KEY = 'sl_pastead_token';
export const PASTEAD_EXTERNAL_URL_KEY = 'sl_pastead_external_url';
export const PASTEAD_POPUP_WINDOW_NAME = 'blockminer_zerads_shortlink';
export const PASTEAD_BROADCAST_CHANNEL = 'blockminer-pastead';
export const PASTEAD_CLAIMED_MESSAGE = 'blockminer:pastead-claimed';
export const PASTEAD_DONE_MESSAGE = 'blockminer:pastead-done';

const POPUP_MIN_WIDTH = 960;
const POPUP_MIN_HEIGHT = 820;
const POPUP_MAX_WIDTH = 1280;
const POPUP_MAX_HEIGHT = 940;

function popupGeometry() {
  const availW = window.screen?.availWidth ?? window.innerWidth;
  const availH = window.screen?.availHeight ?? window.innerHeight;
  const width = Math.min(POPUP_MAX_WIDTH, Math.max(POPUP_MIN_WIDTH, Math.round(availW * 0.92)));
  const height = Math.min(POPUP_MAX_HEIGHT, Math.max(POPUP_MIN_HEIGHT, Math.round(availH * 0.9)));
  const screenLeft = window.screenLeft ?? window.screenX ?? 0;
  const screenTop = window.screenTop ?? window.screenY ?? 0;
  const outerW = window.outerWidth ?? window.innerWidth;
  const outerH = window.outerHeight ?? window.innerHeight;
  const left = Math.max(0, Math.round(screenLeft + (outerW - width) / 2));
  const top = Math.max(0, Math.round(screenTop + (outerH - height) / 2));
  return { width, height, left, top };
}

function popupFeatures(): string {
  const { width, height, left, top } = popupGeometry();
  return [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'scrollbars=yes',
    'resizable=yes',
    'toolbar=no',
    'menubar=no',
    'location=yes',
    'status=no',
  ].join(',');
}

export function isZeradsPopupUsable(popup: Window | null | undefined): boolean {
  if (!popup) return false;
  try {
    if (popup.closed) return false;
    void popup.location;
    return true;
  } catch {
    return false;
  }
}

export function prepareZeradsShortlinkPopup(): Window | null {
  const popup = window.open('about:blank', PASTEAD_POPUP_WINDOW_NAME, popupFeatures());
  return isZeradsPopupUsable(popup) ? popup : null;
}

const POPUP_LOADING_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BlockMiner — Shortlink</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 24px;
    }
    .card {
      max-width: 420px;
      text-align: center;
      padding: 32px 28px;
      border-radius: 24px;
      border: 1px solid #334155;
      background: #1e293b;
      box-shadow: 0 24px 48px rgba(0,0,0,.35);
    }
    .spinner {
      width: 44px;
      height: 44px;
      margin: 0 auto 20px;
      border: 3px solid #334155;
      border-top-color: #f59e0b;
      border-radius: 50%;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 1.05rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 10px; }
    p { font-size: .875rem; line-height: 1.5; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner" aria-hidden="true"></div>
    <h1>BlockMiner</h1>
    <p>Preparando o shortlink ZerAds…<br />Aguarde, você será redirecionado.</p>
  </div>
</body>
</html>`;

export function showZeradsPopupLoading(popup: Window): void {
  try {
    popup.document.open();
    popup.document.write(POPUP_LOADING_HTML);
    popup.document.close();
  } catch {
    /* cross-origin after navigate */
  }
}

function navigatePopup(popup: Window, url: string): void {
  try {
    popup.location.href = url;
    popup.focus();
  } catch {
    try {
      popup.location.assign(url);
      popup.focus();
    } catch {
      /* ignore */
    }
  }
}

export function navigateZeradsShortlinkPopup(popup: Window, externalUrl: string): void {
  navigatePopup(popup, externalUrl);
}

export function openZeradsShortlinkWindow(externalUrl: string): Window | null {
  const popup = prepareZeradsShortlinkPopup();
  if (!popup) return null;
  navigatePopup(popup, externalUrl);
  return popup;
}

export function closeZeradsShortlinkPopup(popup: Window | null | undefined): void {
  if (!popup) return;
  try {
    if (!popup.closed) popup.close();
  } catch {
    /* ignore */
  }
}

function postPasteadBroadcast(payload: { type: string; token?: string | null; message?: string }): void {
  try {
    const opener = window.opener;
    if (opener && !opener.closed) {
      opener.postMessage(payload, window.location.origin);
    }
  } catch {
    /* ignore */
  }
  try {
    const channel = new BroadcastChannel(PASTEAD_BROADCAST_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
}

/** Called from `/shortlinks/pastead/done` after server marks session complete. */
export function broadcastPasteadDone(token: string | null | undefined): void {
  postPasteadBroadcast({ type: PASTEAD_DONE_MESSAGE, token: token ?? null });
}

export function broadcastPasteadClaimed(message: string): void {
  postPasteadBroadcast({ type: PASTEAD_CLAIMED_MESSAGE, message });
}
