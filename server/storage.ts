import { S3Client } from "bun";
const options = {
  endpoint: process.env.OFFICE_S3_ENDPOINT || undefined,
  region: process.env.OFFICE_S3_REGION || "auto",
  bucket: process.env.OFFICE_S3_BUCKET || "",
  accessKeyId: process.env.OFFICE_S3_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.OFFICE_S3_SECRET_ACCESS_KEY || "",
};
export const storageConfigured = !!(
  options.bucket &&
  options.accessKeyId &&
  options.secretAccessKey
);
if (options.endpoint && !/^https?:\/\//.test(options.endpoint))
  throw new Error("OFFICE_S3_ENDPOINT must be an HTTP(S) URL.");
if (
  process.env.NODE_ENV === "production" &&
  options.endpoint?.startsWith("http:")
)
  throw new Error("Production S3 endpoint must use HTTPS.");
export const storage = storageConfigured ? new S3Client(options) : null;
export const storageInfo = () => ({
  configured: storageConfigured,
  provider: "S3-compatible",
  endpoint: options.endpoint || "AWS S3",
  region: options.region,
  bucket: options.bucket,
  maxFileBytes: 5_000_000,
});
export async function checkStorage() {
  if (!storage) throw new Error("External S3 storage is not configured.");
  const key = `checks/${crypto.randomUUID()}.txt`;
  try {
    await storage.write(key, "Little Office storage check", {
      type: "text/plain",
    });
    if ((await storage.file(key).text()) !== "Little Office storage check")
      throw new Error("Storage read check failed.");
  } finally {
    await storage.delete(key);
  }
  return { ok: true };
}
