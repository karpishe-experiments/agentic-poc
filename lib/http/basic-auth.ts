export const ACCESS_GATE_USERNAME = "booklet";

function equal(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

export function hasValidBasicAuthorization(header: string | null, password = process.env.ACCESS_GATE_PASSWORD): boolean {
  if (process.env.DEPLOYMENT_ENV === undefined || process.env.DEPLOYMENT_ENV === "local") return true;
  if (!password || password.length < 16 || !header?.startsWith("Basic ")) return false;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    return separator >= 0 && equal(decoded.slice(0, separator), ACCESS_GATE_USERNAME) && equal(decoded.slice(separator + 1), password);
  } catch { return false; }
}
