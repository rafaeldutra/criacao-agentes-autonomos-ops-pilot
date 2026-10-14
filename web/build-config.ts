/** Base path used when VITE_BASE is unset: self-hosting under /opspilot/ (feature 014). */
export const DEFAULT_BASE = "/opspilot/";

/**
 * Normalizes VITE_BASE into "/segment/.../" (leading and trailing slash).
 * GitHub Pages builds pass "/<repo>/"; anything that could escape the site root fails the build.
 */
export function resolveBase(raw: string | undefined): string {
  const value = raw?.trim() ?? "";
  if (!value) return DEFAULT_BASE;
  const invalid =
    /\s/.test(value) || value.includes(":") || value.includes("//") || value.split("/").includes("..");
  if (invalid) throw new Error(`VITE_BASE inválido: ${JSON.stringify(raw)} (use algo como /meu-repo/)`);
  const withLeading = value.startsWith("/") ? value : `/${value}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}
