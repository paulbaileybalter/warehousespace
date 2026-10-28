// Cloudflare Pages Function — password-protects every page and file on the site
// using HTTP Basic Auth. Set two environment variables in the Pages project:
//   SITE_PASSWORD  (required)   the shared password
//   SITE_USER      (optional)   the username, defaults to "balter"
// If SITE_PASSWORD is missing the site stays locked (fails closed).

async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

async function safeEqual(a, b) {
  // Compare SHA-256 hashes so the check takes the same time wherever the strings differ.
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function onRequest({ request, env, next }) {
  if (!env.SITE_PASSWORD) {
    return new Response('This site is locked: SITE_PASSWORD has not been set in Cloudflare Pages.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const expectedUser = env.SITE_USER || 'balter';
  const header = request.headers.get('Authorization') || '';

  if (header.startsWith('Basic ')) {
    try {
      const bytes = Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);
      const sep = decoded.indexOf(':');
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      const userOk = await safeEqual(user, expectedUser);
      const passOk = await safeEqual(pass, env.SITE_PASSWORD);
      if (sep >= 0 && userOk && passOk) return next();
    } catch (e) {
      // fall through to the 401 below
    }
  }

  return new Response('Password required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Balter Brewing - Raw Material Ordering", charset="UTF-8"', 'Cache-Control': 'no-store' }
  });
}
