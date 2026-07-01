export function publicAsset(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}${path.replace(/^\/+/, "")}`;
}

export function shouldProbeOptionalPublicAssets(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.protocol !== "file:";
}
