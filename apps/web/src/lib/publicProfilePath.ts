export function publicProfilePath(username: string): string {
  return `/@${encodeURIComponent(username)}`;
}

export function usernameFromPublicProfilePath(
  pathname: string,
): string | null {
  if (!pathname.startsWith("/@")) return null;
  const segment = pathname.slice(2).split("/")[0] ?? "";
  if (!segment) return null;

  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
