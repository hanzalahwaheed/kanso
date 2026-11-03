import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export async function extractWeb(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`Could not load the page (HTTP ${res.status}).`);
  const html = await res.text();

  const { document } = parseHTML(html);
  // Readability needs absolute links, because the reader page lives on another host.
  for (const [attr, sel] of [['href', 'a[href]'], ['src', 'img[src]']]) {
    for (const el of document.querySelectorAll(sel)) {
      try {
        el.setAttribute(attr, new URL(el.getAttribute(attr), res.url).href);
      } catch {}
    }
  }

  const article = new Readability(document).parse();
  if (!article?.content) throw new Error('No article text was found on this page.');

  const published = document.querySelector('meta[property="article:published_time"]')?.getAttribute('content');
  return {
    title: article.title || res.url,
    byline: article.byline || article.siteName || new URL(res.url).hostname,
    date: published ? new Date(published) : null,
    source: res.url,
    html: article.content,
  };
}
