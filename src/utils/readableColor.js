// Parses a hex (#fff / #ffffff) or rgb()/rgba() color string into [r, g, b].
// Returns null if the string isn't recognized.
export function parseColor(color) {
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16)
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
      ];
    }
  }
  const rgbMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    return [
      Number(rgbMatch[1]),
      Number(rgbMatch[2]),
      Number(rgbMatch[3])
    ];
  }
  return null;
}

// Picks a readable text color (near-black or near-white) against the given
// background color, based on relative luminance.
export function getReadableTextColor(color) {
  if (!color) return '#f5f5f5';
  const parsed = parseColor(color);
  if (!parsed) return '#f5f5f5';
  const [r, g, b] = parsed;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#121212' : '#f5f5f5';
}
