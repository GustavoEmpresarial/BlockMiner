/**
 * item 95 (pentest A5): extraído de chat/chat.service.ts pra reaproveitar em qualquer
 * campo texto exposto de volta pra outros usuários (username, perfil social) — antes só o
 * chat escapava HTML antes de salvar; username/channelName/bio ficavam raw no banco.
 *
 * Use for contexts that later embed into HTML (Telegram HTML, admin HTML, etc.).
 * For React chat bubbles prefer `sanitizeChatPlainText` + text-node render (no entity soup).
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m] ?? m);
}

/**
 * Chat store path: keep PLAIN TEXT in the DB.
 * - Strip tags / control chars so payloads cannot smuggle markup or weird socket/UI breaks
 * - Do NOT entity-encode (`&lt;`) — React text nodes already escape on render; encoding on
 *   save made honest messages like `<3` show up as `&lt;3` for everyone
 */
export function sanitizeChatPlainText(raw: string, maxLen = 2000): string {
  let s = String(raw ?? "");
  // C0 controls except TAB/LF/CR
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  // Strip HTML / SVG / script tags (including malformed variants attackers paste)
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  // Neutralize leftover angle brackets so stored text never looks like markup
  s = s.replace(/[<>]/g, "");
  // Collapse crazy whitespace but keep intentional newlines
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/[^\S\n]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}
