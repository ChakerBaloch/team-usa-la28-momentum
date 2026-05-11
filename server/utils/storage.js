import { Storage } from '@google-cloud/storage';

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'la28-momentum-cache';
const FILE_NAME = process.env.GCS_FILE_NAME || 'momentum-data.json';

const storage = new Storage();

/**
 * Writes the full orchestration result to Cloud Storage.
 * Called ONLY from the cron endpoint. Nowhere else.
 */
export async function writeResultsToStorage(data) {
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(FILE_NAME);

  await file.save(JSON.stringify(data), {
    contentType: 'application/json',
    metadata: {
      cacheControl: 'public, max-age=3600',
    },
  });
}

/**
 * Returns the public URL for the cached momentum data.
 * No async, no SDK — just a string. The frontend fetches this directly.
 */
export function getStorageUrl() {
  return `https://storage.googleapis.com/${BUCKET_NAME}/${FILE_NAME}`;
}
