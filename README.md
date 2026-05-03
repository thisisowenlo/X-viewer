# X-viewer

A bookmarklet that pulls the focal tweet + first batch of replies from an `x.com` page into clean markdown, then hands it off to an AI chatbot (defaults to Claude). All extraction runs **on your device** using your own logged-in X session — no cookies leave the browser, no paid X API.

**POC scope**: iPhone (iOS Safari) acceptance target. Desktop Chrome works for fast dev iteration. Android / iOS Shortcut / userscript versions are deferred.

## How it works

1. You run the bookmarklet on a tweet page where you're logged in.
2. The bookmarklet reads `ct0` from `document.cookie`, fetches a tiny `x-graphql-meta.json` (current `queryId` + feature flags), and calls X's internal `TweetDetail` GraphQL endpoint with the cookies your browser already sends.
3. The response is parsed into markdown locally, then offered for clipboard + handoff to Claude.

The only server piece is a static host that serves the install page, the bookmarklet bundle, and the meta JSON. Deploy `public/` to any static host (Cloudflare Pages / GitHub Pages / Vercel).

## Build

```bash
npm install
META_URL=https://your-host.example/api/x-graphql-meta.json npm run build
```

This produces:

```
public/
  index.html                  # install page
  bookmarklet.txt             # the javascript:… URL, copy/paste source
  api/x-graphql-meta.json     # served back to the bookmarklet at runtime
  _headers                    # Cloudflare Pages CORS config
```

`META_URL` defaults to a placeholder. **Set it to the absolute URL where the deployed `x-graphql-meta.json` will live**, or the bookmarklet won't be able to fetch it.

## Refreshing the meta JSON (when X rotates)

X rotates `queryId` and the `features` flag set every few weeks. When the bookmarklet starts returning `TweetDetail failed: status=400`, refresh `src/meta.json`:

1. In a desktop Chrome on `x.com`, open DevTools → Network tab.
2. Click into any tweet so the URL becomes `/.../status/...`.
3. Find the request named `TweetDetail` (filter: `graphql`).
4. From the request URL, copy the segment between `/graphql/` and `/TweetDetail` — that's the new `queryId`.
5. From the `features` query parameter, URL-decode the JSON and paste it as the `features` object in `src/meta.json`.
6. Same for `fieldToggles` if present.
7. `npm run build` and redeploy `public/`.

## Install on iPhone (Safari)

1. Open the deployed install page in Safari.
2. Share → Add Bookmark, save with any title.
3. Bookmarks → Edit → tap your new bookmark.
4. Replace the Address with the contents of `bookmarklet.txt` (or the source shown on the install page).
5. Rename the bookmark to `SendToClaude`.
6. Done. To use: open a tweet on `x.com`, tap the address bar, type `send`, tap the suggestion.

## Install on desktop

Drag the blue button on the install page into your bookmarks bar.

## Layout

```
src/
  bookmarklet.js        # entry: cookies → meta → graphql → extractor → overlay
  extractor.js          # pure: TweetDetail JSON → markdown (unit-testable)
  index.template.html   # install page template (%BOOKMARKLET% placeholder)
  meta.json             # queryId + features (you edit this)
build.mjs               # esbuild bundle + URL-encode + template fill
public/                 # build output, gitignored, deploy target
```

## Known limitations (POC)

- Only the focal tweet + first batch of top-level replies. Deeper reply trees, quote tweet expansion, and media URLs are out of scope for the POC.
- Bookmarklet-only. iOS Shortcut wrapper (better share-sheet UX) is a follow-up.
- Maintenance: someone needs to refresh `src/meta.json` when X rotates query IDs.

## Why this approach

Compared to server-side scrapers (`xmdbot`, `r.jina.ai`, etc.):

- **No paid X API.** Uses your own logged-in session.
- **No IP bans.** Requests come from your browser, indistinguishable from normal X usage.
- **Cookies stay on device.** Server only knows public X metadata.
- **Mobile-first.** Designed for the "I just opened a tweet on my phone, send it to my chatbot" flow.

Trade-off: requires you to install a bookmarklet once, and maintainer must occasionally refresh the meta JSON when X rotates schemas.
