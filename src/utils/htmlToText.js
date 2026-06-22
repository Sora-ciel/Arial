// Text content is stored as HTML (TipTap) — strip tags so previews, display
// names, tab labels, and "copy text" actions never leak raw markup like
// "<p>Title</p>".
export function htmlToText(html) {
  return String(html || '')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
