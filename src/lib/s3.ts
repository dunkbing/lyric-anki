import { S3Client } from "bun";

const s3 = new S3Client({
  accessKeyId: process.env.S3_ACCESS_KEY!,
  secretAccessKey: process.env.S3_SECRET_KEY!,
  bucket: process.env.S3_BUCKET!,
  endpoint: process.env.S3_ENDPOINT!,
});

export async function uploadArtwork(id: string, url: string): Promise<string> {
  const res = await fetch(url.replace("100x100", "600x600"));
  const key = `artworks/${id}.jpg`;
  await s3.write(key, await res.arrayBuffer(), { type: "image/jpeg" });
  return key;
}

export function artworkPresignedUrl(key: string, expiresIn = 3600): string {
  return s3.presign(key, { expiresIn });
}
