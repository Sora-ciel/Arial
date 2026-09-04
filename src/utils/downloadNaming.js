// What a saved attachment should be called.
//
// Saving used to hand the browser `download = "image"` — no extension at all,
// so the file landed as "image" and the operating system had to guess what it
// was. Worse, the href pointed straight at the Firebase Storage URL, and the
// `download` attribute is ignored for cross-origin links: the browser navigated
// to the file instead of saving it, which is why saving a picture meant leaving
// the app and saving it again from wherever it opened.
//
// The fetch-into-a-blob part has to happen at the call site. Choosing the name
// does not, so it lives here where it can be tested.

const EXTENSION_BY_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov'
};

// Anything a file system is likely to object to, plus the characters Firebase
// puts in a download URL's path.
const UNSAFE_CHARACTERS = /[^a-zA-Z0-9-_]+/g;

function extensionFromUrl(url) {
  if (typeof url !== 'string') return '';

  // A Firebase download URL carries the object path before "?alt=media" and
  // percent-encodes the slashes, so the extension is still readable from it.
  const withoutQuery = url.split('?')[0];
  const decoded = (() => {
    try {
      return decodeURIComponent(withoutQuery);
    } catch {
      return withoutQuery;
    }
  })();

  const match = decoded.match(/\.([a-zA-Z0-9]{1,5})$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * A filename for a saved attachment.
 *
 * The content type wins when it is known, because it describes the bytes that
 * were actually fetched; the URL is only a hint and is often a redirect or a
 * signed link with no name in it at all.
 */
export function fileNameForMedia({ url, contentType, fallbackBase = 'arial', isVideo = false } = {}) {
  const base = String(fallbackBase || 'arial')
    .replace(UNSAFE_CHARACTERS, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'arial';

  const fromType = EXTENSION_BY_TYPE[String(contentType || '').split(';')[0].trim().toLowerCase()];
  const extension = fromType || extensionFromUrl(url) || (isVideo ? 'mp4' : 'png');

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  return `${base}-${stamp}.${extension}`;
}
