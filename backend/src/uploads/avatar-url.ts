import { IMAGE_FILE_PATTERN } from './image-storage';

/** Only expose our authenticated proxy, never a private Blob URL or storage identifier. */
export function avatarUrl(file: unknown): string | null {
  return typeof file === 'string' && IMAGE_FILE_PATTERN.test(file) ? `/api/uploads/avatars/${file}` : null;
}
