// Cloudflare Worker — password-protects every page and file of the site (password only, no username),
// then serves the static files from ./public.
// Secret (Settings → Variables and Secrets):  SITE_PASSWORD  — the shared password.
// If SITE_PASSWORD is missing the site stays locked (fails closed).

const COOKIE = 'bb_auth';
const MAX_AGE = 60 * 60 * 24 * 30; // stay signed in for 30 days

const enc = (t) => new TextEncoder().encode(t);
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

async function sha(text) { return new Uint8Array(await crypto.subtle.digest('SHA-256', enc(text))); }

async function safeEqual(a, b) {
  // Compare hashes so the check takes the same time wherever the strings differ.
  const [x, y] = await Promise.all([sha(a), sha(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function token(password) {
  const key = await crypto.subtle.importKey('raw', enc(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc('balter-ordering-session')));
}

function getCookie(request, name) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? m[1] : '';
}

const SECURE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
};

function loginPage(error) {
  return new Response(`<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Balter Brewing — Sign in</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#000;font-family:Lexend,system-ui,-apple-system,"Segoe UI",sans-serif}
form{width:min(340px,86vw);padding:28px;border:1px solid #e4e4e4;border-top:6px solid #47D7AC;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.06)}
h1{font-size:19px;margin:0 0 4px}p{margin:0 0 18px;font-size:13px;color:#555}
input{width:100%;box-sizing:border-box;padding:11px 12px;font:inherit;border:1px solid #bbb;border-radius:9px;margin-bottom:12px}
input:focus{outline:2px solid #7566A0;border-color:#7566A0}
button{width:100%;padding:11px;font:inherit;font-weight:600;border:0;border-radius:9px;background:#47D7AC;color:#000;cursor:pointer}
button:hover{background:#3ac79c}.err{color:#b3261e;font-size:13px;margin:0 0 12px}
</style></head><body><form method="POST" action="/">
<h1>Balter Brewing</h1><p>Raw material ordering — enter the password to continue.</p>
${error ? '<p class="err">' + error + '</p>' : ''}
<input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus required>
<button type="submit">Sign in</button></form></body></html>`, { status: error === 'locked' ? 503 : 200, headers: SECURE_HEADERS });
}

export default {
  async fetch(request, env) {
    if (!env.SITE_PASSWORD) {
      return new Response('This site is locked: SITE_PASSWORD has not been set in Cloudflare.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    const expected = await token(env.SITE_PASSWORD);

    if (await safeEqual(getCookie(request, COOKIE), expected)) return env.ASSETS.fetch(request);

    if (request.method === 'POST') {
      let pw = '';
      try { pw = String((await request.formData()).get('password') || ''); } catch (e) { /* treated as wrong */ }
      if (await safeEqual(pw, env.SITE_PASSWORD)) {
        return new Response(null, {
          status: 303,
          headers: { Location: new URL(request.url).pathname, 'Set-Cookie': `${COOKIE}=${expected}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Strict`, 'Cache-Control': 'no-store' }
        });
      }
      return loginPage('That password is not right.');
    }
    return loginPage('');
  }
};
