# Kanso 簡素

*Kanso* is the Zen idea of simplicity: remove what is not necessary.

Swap the host of a link for `kanso.hanzalahwaheed.com` and read only the article.

| Original link | Kanso link |
| --- | --- |
| `https://x.com/addyosmani/status/2117512471930167377` | `https://kanso.hanzalahwaheed.com/addyosmani/status/2117512471930167377` |
| `https://addyosmani.com/blog/cognitive-surrender/` | `https://kanso.hanzalahwaheed.com/addyosmani.com/blog/cognitive-surrender/` |
| any link | `https://kanso.hanzalahwaheed.com/https://…` or `/read?url=…` |

## Run and deploy

```
npm install
npm start        # wrangler dev on http://localhost:8787
npm run deploy   # wrangler deploy to kanso.hanzalahwaheed.com
```

## How it works

Kanso is one Cloudflare Worker ([src/index.js](src/index.js)).

- **X links**: X renders posts in the browser, so the raw HTML has no article text. The Worker asks the public fxtwitter API (`api.fxtwitter.com`) for the post. X Articles come back as Draft.js blocks, which [src/extract-x.js](src/extract-x.js) turns into HTML.
- **Other links**: [src/extract-web.js](src/extract-web.js) downloads the page and runs Mozilla Readability (the Firefox Reader View engine) on it, with linkedom as the DOM.

Rendered pages stay in the Cloudflare edge cache for one hour. Every page is sent with a CSP that blocks all scripts.
