// X (Twitter) pages render in the browser, so the raw HTML has no article body.
// The public fxtwitter API returns the article as Draft.js blocks instead.

const STATUS_RE = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/]+)\/status\/(\d+)/i;

export const isXUrl = (url) => STATUS_RE.test(url);

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STYLE_TAGS = { Bold: 'strong', Italic: 'em', Strikethrough: 's', Code: 'code' };

const BLOCK_TAGS = {
  'header-one': 'h2',
  'header-two': 'h2',
  'header-three': 'h3',
  blockquote: 'blockquote',
  'code-block': 'pre',
  unstyled: 'p',
};

function renderInline(block, entityMap) {
  const { text } = block;
  const marks = Array.from({ length: text.length }, () => ({ styles: new Set(), link: null }));
  for (const r of block.inlineStyleRanges) {
    for (let i = r.offset; i < r.offset + r.length && i < text.length; i++) marks[i].styles.add(r.style);
  }
  for (const r of block.entityRanges) {
    const entity = entityMap[r.key];
    if (entity?.type !== 'LINK') continue;
    for (let i = r.offset; i < r.offset + r.length && i < text.length; i++) marks[i].link = entity.data.url;
  }

  let html = '';
  let i = 0;
  while (i < text.length) {
    const { styles, link } = marks[i];
    const key = [...styles].sort().join() + '|' + link;
    let j = i + 1;
    while (j < text.length && [...marks[j].styles].sort().join() + '|' + marks[j].link === key) j++;
    let seg = esc(text.slice(i, j));
    for (const s of styles) if (STYLE_TAGS[s]) seg = `<${STYLE_TAGS[s]}>${seg}</${STYLE_TAGS[s]}>`;
    if (link) seg = `<a href="${esc(link)}">${seg}</a>`;
    html += seg;
    i = j;
  }
  return html;
}

function renderAtomic(block, entityMap, mediaById) {
  const out = [];
  for (const r of block.entityRanges) {
    const entity = entityMap[r.key];
    if (entity?.type === 'MEDIA') {
      for (const item of entity.data.mediaItems ?? []) {
        const src = mediaById.get(item.mediaId);
        if (src) out.push(`<figure><img src="${esc(src)}" alt="" loading="lazy"></figure>`);
      }
    } else if (entity?.type === 'TWEET' && entity.data.tweetId) {
      const url = `https://x.com/i/status/${entity.data.tweetId}`;
      out.push(`<p class="embed"><a href="${url}">Embedded post</a></p>`);
    }
  }
  return out.join('\n');
}

function renderBlocks(content, mediaEntities) {
  // entityMap arrives as [{key, value}] here, but plain Draft.js uses an object.
  const entityMap = Array.isArray(content.entityMap)
    ? Object.fromEntries(content.entityMap.map((e) => [e.key, e.value]))
    : content.entityMap;
  const mediaById = new Map(mediaEntities.map((m) => [m.media_id, m.media_info?.original_img_url]));

  const html = [];
  let openList = null;
  for (const block of content.blocks) {
    const listTag =
      block.type === 'unordered-list-item' ? 'ul' : block.type === 'ordered-list-item' ? 'ol' : null;
    if (openList && listTag !== openList) {
      html.push(`</${openList}>`);
      openList = null;
    }
    if (listTag) {
      if (!openList) html.push(`<${listTag}>`);
      openList = listTag;
      html.push(`<li>${renderInline(block, entityMap)}</li>`);
    } else if (block.type === 'atomic') {
      html.push(renderAtomic(block, entityMap, mediaById));
    } else if (block.text.trim()) {
      const tag = BLOCK_TAGS[block.type] ?? 'p';
      html.push(`<${tag}>${renderInline(block, entityMap)}</${tag}>`);
    }
  }
  if (openList) html.push(`</${openList}>`);
  return html.join('\n');
}

export async function extractX(url) {
  const [, user, id] = url.match(STATUS_RE);
  const res = await fetch(`https://api.fxtwitter.com/${user}/status/${id}`, {
    headers: { 'user-agent': 'kanso-reader/1.0 (+https://kanso.hanzalahwaheed.com)' },
  });
  if (!res.ok) throw new Error(`Could not load the post (HTTP ${res.status}).`);
  const { tweet } = await res.json();
  if (!tweet) throw new Error('The post was not found. It can be private or deleted.');

  const byline = `${tweet.author.name} (@${tweet.author.screen_name})`;
  const date = new Date(tweet.created_at);

  if (tweet.article) {
    const a = tweet.article;
    const cover = a.cover_media?.media_info?.original_img_url;
    return {
      title: a.title,
      byline,
      date,
      source: tweet.url,
      cover,
      html: renderBlocks(a.content, a.media_entities ?? []),
    };
  }

  // A normal post or a long "note" post: show the text and the photos.
  const paragraphs = tweet.text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`);
  const photos = (tweet.media?.photos ?? []).map((p) => `<figure><img src="${esc(p.url)}" alt="" loading="lazy"></figure>`);
  return {
    title: `Post by ${tweet.author.name}`,
    byline,
    date,
    source: tweet.url,
    html: [...paragraphs, ...photos].join('\n'),
  };
}
