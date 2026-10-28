// Cloudflare Worker — password-protects every page and file of the site with HTTP Basic Auth,
// then serves the static files from ./public.
// Secrets (Settings → Variables and Secrets):
//   SITE_PASSWORD  (required)  the shared password
//   SITE_USER      (optional)  the username, defaults to "balter"
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

export default {
  async fetch(request, env) {
    if (!env.SITE_PASSWORD) {
      return new Response('This site is locked: SITE_PASSWORD has not been set in Cloudflare.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    const expectedUser = env.SITE_USER || 'balter';
    const header = request.headers.get('Authorization') || '';

    if (header.startsWith('Basic ')) {
      try {
        const bytes = Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0));
        const decoded = new TextDecoder().decode(bytes);
        const sep = decoded.indexOf(':');
        const userOk = await safeEqual(decoded.slice(0, sep), expectedUser);
        const passOk = await safeEqual(decoded.slice(sep + 1), env.SITE_PASSWORD);
        if (sep >= 0 && userOk && passOk) return env.ASSETS.fetch(request);
      } catch (e) {
        // fall through to the 401 below
      }
    }

    return new Response('Password required.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Balter Brewing - Raw Material Ordering", charset="UTF-8"', 'Cache-Control': 'no-store' }
    });
  }
};
