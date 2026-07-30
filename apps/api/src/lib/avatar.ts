export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const DEFAULT_AVATAR_KEY = "avatars/default.svg";

type AvatarExtension = "jpg" | "jpeg" | "png" | "webp";

const CONTENT_TYPES: Record<AvatarExtension, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export class ProfileImageError extends Error {
  constructor(public readonly code: "invalid_image_type" | "image_too_large") {
    super(code);
    this.name = "ProfileImageError";
  }
}

function hasMagicBytes(bytes: Uint8Array, extension: AvatarExtension): boolean {
  if (extension === "jpg" || extension === "jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (extension === "png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export async function parseAvatarFile(file: File): Promise<{
  bytes: ArrayBuffer;
  extension: AvatarExtension;
  contentType: string;
}> {
  if (file.size === 0 || file.size > MAX_AVATAR_BYTES) {
    throw new ProfileImageError("image_too_large");
  }

  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (!extension || !(extension in CONTENT_TYPES)) {
    throw new ProfileImageError("invalid_image_type");
  }
  const typedExtension = extension as AvatarExtension;
  const contentType = CONTENT_TYPES[typedExtension];
  if (file.type !== contentType) {
    throw new ProfileImageError("invalid_image_type");
  }

  const bytes = await file.arrayBuffer();
  if (!hasMagicBytes(new Uint8Array(bytes), typedExtension)) {
    throw new ProfileImageError("invalid_image_type");
  }
  return { bytes, extension: typedExtension, contentType };
}

export function avatarUrl(mediaOrigin: string, key: string | null): string {
  const origin = mediaOrigin.endsWith("/") ? mediaOrigin : `${mediaOrigin}/`;
  return new URL(key ?? DEFAULT_AVATAR_KEY, origin).toString();
}

export function avatarMediaType(key: string | null): string {
  if (!key) return "image/svg+xml";
  const extension = key.split(".").at(-1)?.toLowerCase() as AvatarExtension;
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}
