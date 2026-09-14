export function normalizeAssetUri(uri: string): string {
  const value = uri.replaceAll("\\", "/");
  if (!value || value.startsWith("/") || /^[A-Za-z]:/.test(value) || /[\x00-\x1f]/.test(value) || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Asset URI must be a relative path without empty segments or traversal.");
  }
  return value;
}
