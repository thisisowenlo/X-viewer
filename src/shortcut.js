// Entry point for iOS Shortcuts "Run JavaScript on Web Page" action.
//
// The Shortcut runtime injects this script into the active Safari tab with a
// system-level privilege that bypasses the page's CSP (which is what blocks
// the bookmarklet path on x.com). It exposes a global `completion(value)`
// function we call to pass the extracted markdown back to the Shortcut, which
// then puts it on the clipboard and opens Claude.

import { extractMarkdown } from "./extractor.js";

// Inlined at build time via esbuild define.
const META = META_INJECTED;

const BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAA8haGSeXJZAvT5wnxSAARSqfEs0M%3DTYfbDKbT3jJPCEVnMYqilB28NHfOPqkca3qaAxGfsyKCs0wRbw";

(async () => {
  try {
    const tweetId = location.pathname.match(/^\/[^/]+\/status\/(\d+)/)?.[1];
    if (!tweetId) {
      completion("ERROR: not on an X tweet page (URL needs /status/<id>)");
      return;
    }
    const ct0 = document.cookie.match(/(?:^|; )ct0=([^;]+)/)?.[1];
    if (!ct0) {
      completion("ERROR: not logged into X in Safari");
      return;
    }

    const variables = {
      focalTweetId: tweetId,
      with_rux_injections: false,
      rankingMode: "Relevance",
      includePromotedContent: false,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true,
      withVoice: true,
      ...(META.variables ?? {}),
    };
    const params = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(META.features ?? {}),
    });
    if (META.fieldToggles) {
      params.set("fieldToggles", JSON.stringify(META.fieldToggles));
    }
    const url = `https://x.com/i/api/graphql/${META.queryId}/TweetDetail?${params.toString()}`;

    const r = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        authorization: `Bearer ${BEARER}`,
        "x-csrf-token": ct0,
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-client-language":
          document.documentElement.lang || navigator.language || "en",
        "content-type": "application/json",
        accept: "*/*",
      },
    });
    if (!r.ok) {
      let body = "";
      try {
        body = " " + (await r.text()).slice(0, 200);
      } catch {}
      completion(`ERROR: TweetDetail status=${r.status}${body}`);
      return;
    }
    const json = await r.json();
    const md = extractMarkdown(json, { focalTweetId: tweetId });
    completion(md);
  } catch (e) {
    completion("ERROR: " + (e?.message ?? String(e)));
  }
})();
