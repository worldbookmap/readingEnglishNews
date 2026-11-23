import "server-only";
import { db } from "./supabase";

// Images from an uploaded EPUB live in a public Supabase Storage bucket, one folder per
// book: `<key>/<n>.<ext>`, where the key is the uuid in the book's url ("book:<key>").
// The bucket is created the first time it's needed.

const BUCKET = "book-images";
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
export const isBookKey = (key: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key);

let bucketReady: Promise<void> | null = null;
function ensureBucket() {
  bucketReady ??= (async () => {
    const { error } = await db().storage.getBucket(BUCKET);
    if (!error) return;
    const created = await db().storage.createBucket(BUCKET, { public: true });
    if (created.error && !/exist/i.test(created.error.message)) throw created.error;
  })().catch((e) => {
    bucketReady = null;
    throw e;
  });
  return bucketReady;
}

// The public URL every image of the book `key` starts with.
export const bookImagePrefix = (key: string) => db().storage.from(BUCKET).getPublicUrl(`${key}/`).data.publicUrl;

export async function uploadBookImage(key: string, name: string, file: Blob): Promise<string> {
  const ext = EXTENSIONS[file.type];
  if (!isBookKey(key) || !/^\d{1,5}$/.test(name) || !ext || file.size > MAX_IMAGE_BYTES) throw new Error("invalid image");
  await ensureBucket();
  const path = `${key}/${name}.${ext}`;
  const { error } = await db().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: true, cacheControl: "31536000" });
  if (error) throw error;
  return db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Removes a deleted book's images (best effort).
export async function deleteBookImages(key: string) {
  if (!isBookKey(key)) return;
  try {
    const { data } = await db().storage.from(BUCKET).list(key, { limit: 1000 });
    if (data?.length) await db().storage.from(BUCKET).remove(data.map((f) => `${key}/${f.name}`));
  } catch {
    // The bucket may not exist yet; nothing to remove then.
  }
}
