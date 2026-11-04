import { isXUrl, extractX } from './extract-x.js';
import { extractWeb } from './extract-web.js';
import indexPage from './pages/index.html';
import readerPage from './pages/reader.html';
import errorPage from './pages/error.html';
import favicon from '../brand/favicon.svg';
import lockup from '../brand/kanso-lockup.svg';
import mark from '../brand/kanso-mark.svg';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fill = (template, values) => template.replace(/{{(\w+)}}/g, (_, key) => values[key] ?? '');

// Inline the logos in the text color, so they follow the light and dark themes.
const inlineLogo = (svg, className) =>
  svg
    .replaceAll('#111', 'currentColor')
    .replace('<svg ', `<svg class="${className}" role="img" aria-label="Kanso" `)
    .replace(/ (width|height)="\d+"/g, '');

const brand = { lockup: inlineLogo(lockup, 'lockup'), mark: inlineLogo(mark, 'mark') };

// Map a request path to the article URL, so a link works after only its host is swapped:
//   /addyosmani/status/123         -> https://x.com/addyosmani/status/123
//   /https://example.com/post      -> https://example.com/post
//   /example.com/post              -> https://example.com/post
function targetFromPath(url) {
  const path = decodeURIComponent(url.pathname.slice(1));
  if (!path) return null;
  if (/^[^/]+\/status\/\d+/.test(path)) return `https://x.com/${path}`;
  // Browsers and proxies can fold "https://" in a path to "https:/".
  const full = path.match(/^(https?):\/*(.+)$/i);
  if (full) return `${full[1]}://${full[2]}${url.search}`;
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(path)) return `https://${path}${url.search}`;
  return null;
}

async function renderReader(target) {
  const article = isXUrl(target) ? await extractX(target) : await extractWeb(target);
  const date = article.date && !isNaN(article.date)
    ? article.date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  return fill(readerPage, {
    ...brand,
    title: esc(article.title),
    meta: esc([article.byline, date].filter(Boolean).join(' · ')),
    source: esc(article.source),
    cover: article.cover ? `<img class="cover" src="${esc(article.cover)}" alt="">` : '',
    content: article.html,
  });
}

const html = (status, body, cache = 'no-store') =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': cache,
      // Extracted pages come from other sites, so no script may run in them.
      'content-security-policy': "script-src 'none'; object-src 'none'; frame-src 'none'",
    },
  });

const errorResponse = (status, message) => html(status, fill(errorPage, { ...brand, message: esc(message) }));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/') return html(200, fill(indexPage, brand), 'public, max-age=3600');
    if (url.pathname === '/favicon.svg' || url.pathname === '/favicon.ico') {
      return new Response(favicon, {
        headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' },
      });
    }

    const target = url.pathname === '/read' ? url.searchParams.get('url')?.trim() : targetFromPath(url);
    if (!target || !/^https?:\/\//i.test(target)) {
      return errorResponse(400, 'Use a full link, or put kanso in place of the host of the link.');
    }

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/read?url=${encodeURIComponent(target)}`);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    try {
      const response = html(200, await renderReader(target), 'public, max-age=3600');
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (err) {
      return errorResponse(502, err.message);
    }
  },
};
