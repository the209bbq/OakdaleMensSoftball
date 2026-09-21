/** Max edge length for square profile / team photos (pixels). */
export const MAX_PHOTO_EDGE = 256;

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
