import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

export const IMAGE_STORAGE = 'IMAGE_STORAGE';
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const IMAGE_FILE_PATTERN = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

export type ImageExtension = 'jpg' | 'png' | 'webp';
export const CONTENT_TYPE_BY_EXTENSION: Record<ImageExtension, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Storage boundary. Implementations: VercelBlobImageStorage (persistent object storage, used on Vercel) and
 * LocalDiskImageStorage (local development / hosts with a persistent volume at UPLOAD_DIR). Vercel Functions
 * have an ephemeral filesystem, so imageStorageFromEnv() refuses the local disk there.
 */
export interface ImageStorage {
  /** Stores bytes under a server-generated name and returns that name. */
  save(bytes: Buffer, extension: ImageExtension): Promise<string>;
  /** Returns null when the name is malformed or the file does not exist. */
  read(fileName: string): Promise<Buffer | null>;
  /** Best-effort removal (replaced avatar / orphan after a failed database write). Never throws. */
  remove?(fileName: string): Promise<void>;
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

  async remove(fileName: string) {
    if (!IMAGE_FILE_PATTERN.test(fileName)) return;
    try { await rm(path.join(this.dir, fileName), { force: true }); } catch { /* best effort */ }
  }
}

/** Minimal subset of @vercel/blob used here (injectable for tests). */
export interface BlobClient {
  put(pathname: string, body: Buffer, options: { access: 'private'; contentType: string; addRandomSuffix: false; allowOverwrite: false; cacheControlMaxAge: number }): Promise<unknown>;
  get(pathname: string, options: { access: 'private' }): Promise<{ statusCode: number; stream: ReadableStream<Uint8Array> | null } | null>;
  del?(pathname: string): Promise<unknown>;
}

/**
 * Persistent storage in a PRIVATE Vercel Blob store. Objects are never publicly addressable; the existing
 * GET /api/uploads/services/:file route validates the name and streams the bytes. Authentication comes from
 * the Vercel project's Blob integration (OIDC: BLOB_STORE_ID + VERCEL_OIDC_TOKEN) or BLOB_READ_WRITE_TOKEN —
 * never from the browser.
 */
export class VercelBlobImageStorage implements ImageStorage {
  constructor(private readonly client: BlobClient, private readonly folder = 'services') {}

  async save(bytes: Buffer, extension: ImageExtension) {
    const fileName = `${randomBytes(16).toString('hex')}.${extension}`;
    await this.client.put(`${this.folder}/${fileName}`, bytes, {
      access: 'private', contentType: CONTENT_TYPE_BY_EXTENSION[extension], addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 31536000,
    });
    return fileName;
  }

  async read(fileName: string) {
    if (!IMAGE_FILE_PATTERN.test(fileName)) return null;
    try {
      const result = await this.client.get(`${this.folder}/${fileName}`, { access: 'private' });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const chunks: Uint8Array[] = [];
      const reader = result.stream.getReader();
      for (let total = 0; ;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) { await reader.cancel(); return null; }
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }

  async remove(fileName: string) {
    if (!IMAGE_FILE_PATTERN.test(fileName) || !this.client.del) return;
    try { await this.client.del(`${this.folder}/${fileName}`); } catch { /* best effort */ }
  }
}

/** Storage that refuses to operate; used on Vercel when no Blob store is connected (fail closed, no data loss). */
export class UnconfiguredImageStorage implements ImageStorage {
  async save(): Promise<string> { throw new Error('IMAGE_STORAGE_NOT_CONFIGURED'); }
  async read() { return null; }
}

export function blobConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.BLOB_READ_WRITE_TOKEN?.trim() || env.BLOB_STORE_ID?.trim());
}

/** Vercel Blob when configured; local disk only off-Vercel; otherwise fail closed. */
export function imageStorageFromEnv(env: NodeJS.ProcessEnv = process.env, folder = 'services'): ImageStorage {
  if (blobConfigured(env)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const blob = require('@vercel/blob') as BlobClient;
    return new VercelBlobImageStorage({ put: (p, b, o) => blob.put(p, b, o), get: (p, o) => blob.get(p, o), del: (p) => (blob as unknown as { del(p: string): Promise<unknown> }).del(p) }, folder);
  }
  if (env.VERCEL === '1') return new UnconfiguredImageStorage();
  return new LocalDiskImageStorage(uploadRoot(env), folder);
}
