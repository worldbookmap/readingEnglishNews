// Single-user password gate. If APP_PASSWORD is unset (e.g. local dev) the app is open.

export const AUTH_COOKIE = "ren_auth";

export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`reading-english-news:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(hash).toString("hex");
}

export async function isValidToken(token: string | undefined): Promise<boolean> {
  const password = process.env.APP_PASSWORD;
  if (!password) return true;
  return !!token && token === (await authToken(password));
}
