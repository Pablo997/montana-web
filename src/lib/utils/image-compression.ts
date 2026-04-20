import imageCompression from 'browser-image-compression';

const DEFAULT_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: 'image/webp' as const,
};

/**
 * Compress an image file on the client before upload. Keeps storage usage
 * low enough to stay inside the Supabase free tier on the MVP.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const compressed = await imageCompression(file, DEFAULT_OPTIONS);
  return new File([compressed], renameExtension(file.name, 'webp'), {
    type: 'image/webp',
  });
}

function renameExtension(name: string, ext: string) {
  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  return `${base}.${ext}`;
}

/**
 * Read intrinsic pixel dimensions of an image file without mounting it in
 * the DOM. We persist these in `incident_media` so the gallery can reserve
 * space with `aspect-ratio` and avoid layout shift when thumbnails load.
 *
 * Uses `createImageBitmap` (widely supported in modern browsers) and
 * gracefully returns `null` dimensions on unsupported files instead of
 * throwing, since photo metadata is a nice-to-have, not a blocker.
 */
export async function readImageDimensions(
  file: File,
): Promise<{ width: number | null; height: number | null }> {
  if (typeof createImageBitmap !== 'function' || !file.type.startsWith('image/')) {
    return { width: null, height: null };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return dims;
  } catch {
    return { width: null, height: null };
  }
}
