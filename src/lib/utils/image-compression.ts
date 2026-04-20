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
