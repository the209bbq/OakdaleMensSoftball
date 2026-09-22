/** Max edge length for square profile / team photos (pixels). */
export const MAX_PHOTO_EDGE = 256;

/** Max width for landing-page banner images (pixels). */
export const MAX_BANNER_WIDTH = 512;

/** Match the server cap on stored data:image URLs. */
export const MAX_DATA_URL_CHARS = 800000;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Resize a picked image to a ≤256px square JPEG data URL (quality 0.8).
 * Center-crops to a square before scaling down.
 */
export async function fileToSquareDataUrl(file: File, maxEdge = MAX_PHOTO_EDGE): Promise<string> {
  const src = await readFileAsDataUrl(file);
  const img = await loadImage(src);
  const sourceSize = Math.min(img.width, img.height) || maxEdge;
  const sx = Math.max(0, (img.width - sourceSize) / 2);
  const sy = Math.max(0, (img.height - sourceSize) / 2);
  const dest = Math.min(maxEdge, sourceSize) || maxEdge;
  const canvas = document.createElement('canvas');
  canvas.width = dest;
  canvas.height = dest;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not resize image');
  ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, dest, dest);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/**
 * Resize a picked image to a banner JPEG data URL (max width 512px, quality 0.8).
 * Preserves aspect ratio. Shrinks quality if the result exceeds the stored-URL cap.
 */
export async function fileToBannerDataUrl(file: File, maxWidth = MAX_BANNER_WIDTH): Promise<string> {
  const src = await readFileAsDataUrl(file);
  const img = await loadImage(src);
  const destW = Math.min(maxWidth, img.width || maxWidth) || maxWidth;
  const destH = Math.max(1, Math.round(((img.height || destW) / (img.width || destW)) * destW));
  const canvas = document.createElement('canvas');
  canvas.width = destW;
  canvas.height = destH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not resize image');
  ctx.drawImage(img, 0, 0, destW, destH);
  let quality = 0.8;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > MAX_DATA_URL_CHARS && quality > 0.4) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error('Image is too large even after resizing');
  }
  return dataUrl;
}
