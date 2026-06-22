// Shared presentation helpers for file-registry entries (the global content
// pool in storage.js) — used wherever entries are listed or shared into a
// folder: the File Library and the file-picker popup.

export const TYPE_ICONS = { image: '🖼', video: '🎬', text: '📄', json: '📋' };
export const SHAREABLE = new Set(['image', 'video', 'text', 'json']);

// Maps a registry entry's content `type` to the block type/field it becomes
// when added to a folder (e.g. an image file becomes an `image` block whose
// `src` field holds the content).
export const CONTENT_TYPE_TO_BLOCK = {
  image: { type: 'image', field: 'src' },
  video: { type: 'image', field: 'src' },
  text: { type: 'cleantext', field: 'content' },
  json: { type: 'task', field: 'tasks' },
};

export function fileExt(e) {
  return e.file?.split('.').pop() ?? '';
}

// Defensive: entries saved before display names were stripped of markup
// can still carry raw HTML tags — strip at render time too, so old files
// clean up automatically without needing a data migration.
export function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, '').trim();
}

export function displayFilename(e) {
  const name = stripTags(e.displayName) || e.displayName || 'Untitled';
  return `${name}.${fileExt(e)}`;
}
