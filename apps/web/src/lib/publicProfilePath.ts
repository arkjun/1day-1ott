export function publicProfilePath(username: string): string {
  return `/@${encodeURIComponent(username)}`;
}

export function usernameFromPublicProfilePath(
  pathname: string,
): string | null {
  const segment = pathname.slice(1).split("/")[0] ?? "";
  if (!segment) return null;

  try {
    const decoded = decodeURIComponent(segment);
    return decoded.startsWith("@") && decoded.length > 1
      ? decoded.slice(1)
      : null;
  } catch {
    return null;
  }
}
