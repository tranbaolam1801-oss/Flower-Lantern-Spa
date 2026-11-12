import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

export const IMAGE_STORAGE = 'IMAGE_STORAGE';
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const IMAGE_FILE_PATTERN = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

export type ImageExtension = 'jpg' | 'png' | 'webp';
export const CONTENT_TYPE_BY_EXTENSION: Record<ImageExtension, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Storage boundary. Only a local-disk implementation exists. Hosts with ephemeral disks (most PaaS/containers) lose
 * files on redeploy: mount a persistent volume at UPLOAD_DIR or add an object-storage implementation of this interface.
 */
export interface ImageStorage {
  /** Stores bytes under a server-generated name and returns that name. */
  save(bytes: Buffer, extension: ImageExtension): Promise<string>;
  /** Returns null when the name is malformed or the file does not exist. */
  read(fileName: string): Promise<Buffer | null>;
}

/** Detects the real type from magic bytes; the client-declared type and name are never trusted. */
export function detectImageExtension(b: Buffer): ImageExtension | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

export function uploadRoot(env: NodeJS.ProcessEnv = process.env) {
  return path.resolve(env.UPLOAD_DIR?.trim() || path.resolve(__dirname, '..', '..', 'uploads'));
}

export class LocalDiskImageStorage implements ImageStorage {
  constructor(private readonly root: string, private readonly folder = 'services') {}

  private get dir() { return path.join(this.root, this.folder); }

  async save(bytes: Buffer, extension: ImageExtension) {
    await mkdir(this.dir, { recursive: true });
    const fileName = `${randomBytes(16).toString('hex')}.${extension}`;
    await writeFile(path.join(this.dir, fileName), bytes, { flag: 'wx' });
    return fileName;
  }

  async read(fileName: string) {
    if (!IMAGE_FILE_PATTERN.test(fileName)) return null;
    try { return await readFile(path.join(this.dir, fileName)); } catch { return null; }
  }
}
