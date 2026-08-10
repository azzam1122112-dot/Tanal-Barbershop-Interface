/**
 * Builds a shareable URL from the origin visible to the browser.
 *
 * Server request URLs may contain an internal reverse-proxy host such as
 * `localhost:3000`. For links shown immediately in a browser, its own origin is
 * the authoritative public address. The final URL is forced to stay on that
 * origin while retaining the requested path, query, and hash.
 */
export function absoluteBrowserUrl(path: string, browserOrigin: string) {
  const origin = new URL(browserOrigin).origin;
  const candidate = new URL(path, `${origin}/`);
  const safePath = `${candidate.pathname}${candidate.search}${candidate.hash}`;
  return new URL(safePath, `${origin}/`).toString();
}
