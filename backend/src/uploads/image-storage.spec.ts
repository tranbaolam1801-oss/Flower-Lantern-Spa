import {
  BlobClient, imageStorageFromEnv, LocalDiskImageStorage, MAX_IMAGE_BYTES, UnconfiguredImageStorage, VercelBlobImageStorage,
} from './image-storage';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

function streamOf(bytes: Buffer, chunk = 16): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) { controller.close(); return; }
      controller.enqueue(new Uint8Array(bytes.subarray(offset, offset + chunk)));
      offset += chunk;
    },
  });
}

/** In-memory fake of the two @vercel/blob calls used, recording put options. */
function fakeBlob() {
  const store = new Map<string, Buffer>();
  const puts: Array<{ pathname: string; options: unknown }> = [];
  const client: BlobClient = {
    put: async (pathname, body, options) => { puts.push({ pathname, options }); store.set(pathname, Buffer.from(body)); return {}; },
    get: async (pathname) => (store.has(pathname) ? { statusCode: 200, stream: streamOf(store.get(pathname)!) } : null),
  };
  return { client, store, puts };
}

describe('VercelBlobImageStorage (private store)', () => {
  it('stores under services/<random>.ext as a PRIVATE blob with the detected content type, and reads it back', async () => {
    const blob = fakeBlob();
    const storage = new VercelBlobImageStorage(blob.client);
    const name = await storage.save(PNG, 'png');
    expect(name).toMatch(/^[a-f0-9]{32}\.png$/);
    expect(blob.puts[0]).toEqual({
      pathname: `services/${name}`,
      options: expect.objectContaining({ access: 'private', contentType: 'image/png', addRandomSuffix: false, allowOverwrite: false }),
    });
    expect(await storage.read(name)).toEqual(PNG);
  });

  it('returns null for malformed names without calling the store (no traversal)', async () => {
    const blob = fakeBlob();
    const get = jest.spyOn(blob.client, 'get');
    const storage = new VercelBlobImageStorage(blob.client);
    for (const bad of ['../x.png', 'a.png', 'services/abc.png', `${'a'.repeat(32)}.gif`]) expect(await storage.read(bad)).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('returns null for missing objects and when the store errors', async () => {
    const storage = new VercelBlobImageStorage({ put: async () => ({}), get: async () => { throw new Error('network'); } });
    expect(await storage.read(`${'a'.repeat(32)}.png`)).toBeNull();
    expect(await new VercelBlobImageStorage(fakeBlob().client).read(`${'b'.repeat(32)}.png`)).toBeNull();
  });

  it('refuses objects larger than the upload limit', async () => {
    const big = Buffer.alloc(MAX_IMAGE_BYTES + 1, 0);
    const storage = new VercelBlobImageStorage({ put: async () => ({}), get: async () => ({ statusCode: 200, stream: streamOf(big, 65536) }) });
    expect(await storage.read(`${'c'.repeat(32)}.png`)).toBeNull();
  });
});

describe('imageStorageFromEnv', () => {
  it('uses Vercel Blob when a store is connected', () => {
    expect(imageStorageFromEnv({ BLOB_STORE_ID: 'store_x', VERCEL: '1' })).toBeInstanceOf(VercelBlobImageStorage);
    expect(imageStorageFromEnv({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_x' })).toBeInstanceOf(VercelBlobImageStorage);
  });
  it('fails closed on Vercel without a store (ephemeral filesystem must not be used)', async () => {
    const s = imageStorageFromEnv({ VERCEL: '1' });
    expect(s).toBeInstanceOf(UnconfiguredImageStorage);
    await expect(s.save(PNG, 'png')).rejects.toThrow('IMAGE_STORAGE_NOT_CONFIGURED');
  });
  it('uses the local disk only off Vercel (development)', () => {
    expect(imageStorageFromEnv({})).toBeInstanceOf(LocalDiskImageStorage);
  });
});
