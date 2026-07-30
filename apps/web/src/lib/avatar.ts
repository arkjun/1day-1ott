import { PROFILE_BIO_MAX_LENGTH } from "@1ott/shared";

export const DEFAULT_AVATAR_URL =
  "https://media.1day1ott.com/avatars/default.svg";
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";

const AVATAR_TYPES = new Set(AVATAR_ACCEPT.split(","));

export function avatarUrl(key?: string | null): string {
  return key
    ? `https://media.1day1ott.com/${key}`
    : DEFAULT_AVATAR_URL;
}

export function validateAvatarFile(
  file: File,
): "invalid_image_type" | "image_too_large" | null {
  if (!AVATAR_TYPES.has(file.type)) return "invalid_image_type";
  if (file.size === 0 || file.size > MAX_AVATAR_BYTES) return "image_too_large";
  return null;
}

export { PROFILE_BIO_MAX_LENGTH };
