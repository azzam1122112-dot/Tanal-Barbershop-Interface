export const SESSION_COOKIE_NAME = "tanal_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export function getSessionExpiresAt(now = new Date()) {
  return new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
}
