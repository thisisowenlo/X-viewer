import { extractMarkdown } from "./extractor.js";

// Replaced at build time by build.mjs.
const META_URL = "__META_URL__";

// Public bearer token used by x.com web client; well-known, multi-year stable.
const BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAA8haGSeXJZAvT5wnxSAARSqfEs0M%3DTYfbDKbT3jJPCEVnMYqilB28NHfOPqkca3qaAxGfsyKCs0wRbw";

const CHATBOT_URL = "https://claude.ai/new";

main();

async function main() {
  const tweetId = getFocalTweetId();
  if (!tweetId) {
    alert("X-viewer: open an X tweet page first (URL must contain /status/<id>)");
    return;
  }
  const ct0 = getCt0();
  if (!ct0) {
    alert("X-viewer: please log into X in this browser first");
    return;
  }

  const overlay = openOverlay("Fetching thread…");
  try {
    if (META_URL === "__META_URL__") {
      throw new Error("META_URL not configured at build time");
    }
    const meta = await fetchMeta();
    const json = await fetchTweetDetail(tweetId, ct0, meta);
    const md = extractMarkdown(json, { focalTweetId: tweetId });
    overlay.showResult(md);
  } catch (e) {
    overlay.showError(String(e?.message ?? e));
  }
}

function getFocalTweetId() {
  const m = location.pathname.match(/^\/[^/]+\/status\/(\d+)/);
  return m ? m[1] : null;
}

function getCt0() {
  const m = document.cookie.match(/(?:^|; )ct0=([^;]+)/);
  return m ? m[1] : null;
}

async function fetchMeta() {
  const r = await fetch(META_URL, { cache: "no-store" });
  if (!r.ok) throw new Error(`meta fetch failed: ${r.status}`);
  return r.json();
}

async function fetchTweetDetail(focalTweetId, ct0, meta) {
  const variables = {
    focalTweetId,
    referrer: "tweet",
    with_rux_injections: false,
    rankingMode: "Relevance",
    includePromotedContent: false,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: true,
    withBirdwatchNotes: true,
    withVoice: true,
    ...(meta.variables ?? {}),
  };

  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(meta.features ?? {}),
  });
  if (meta.fieldToggles) {
    params.set("fieldToggles", JSON.stringify(meta.fieldToggles));
  }

  const url = `https://x.com/i/api/graphql/${meta.queryId}/TweetDetail?${params.toString()}`;

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
    let detail = "";
    try {
      detail = " " + (await r.text()).slice(0, 200);
    } catch {}
    throw new Error(`TweetDetail failed: status=${r.status}${detail}`);
  }
  return r.json();
}

function openOverlay(initialMessage) {
  const root = document.createElement("div");
  root.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483647;" +
    "display:flex;flex-direction:column;padding:16px;box-sizing:border-box;" +
    "color:#fff;font:14px/1.4 -apple-system,system-ui,sans-serif;";

  const bar = document.createElement("div");
  bar.style.cssText =
    "display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;";
  const title = document.createElement("strong");
  title.textContent = "X-viewer";
  title.style.flex = "1";
  bar.appendChild(title);

  const closeBtn = mkButton("Close", () => root.remove());
  bar.appendChild(closeBtn);

  const body = document.createElement("div");
  body.style.cssText =
    "flex:1;display:flex;flex-direction:column;min-height:0;";
  body.textContent = initialMessage;

  root.appendChild(bar);
  root.appendChild(body);
  document.body.appendChild(root);

  return {
    showResult(md) {
      body.textContent = "";
      const ta = document.createElement("textarea");
      ta.value = md;
      ta.readOnly = true;
      ta.style.cssText =
        "flex:1;width:100%;background:#111;color:#eee;border:1px solid #444;" +
        "padding:8px;font:12px/1.4 ui-monospace,Menlo,monospace;resize:none;" +
        "box-sizing:border-box;";
      body.appendChild(ta);

      const actions = document.createElement("div");
      actions.style.cssText =
        "display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;";

      const copyBtn = mkButton("Copy", async () => {
        try {
          await navigator.clipboard.writeText(md);
          copyBtn.textContent = "Copied";
        } catch {
          ta.focus();
          ta.select();
          copyBtn.textContent = "Use long-press → Copy";
        }
      });
      const openBtn = mkButton("Copy & Open Claude", async () => {
        try {
          await navigator.clipboard.writeText(md);
        } catch {}
        location.assign(CHATBOT_URL);
      });

      actions.appendChild(copyBtn);
      actions.appendChild(openBtn);
      body.appendChild(actions);

      // Pre-select so iOS users can long-press the textarea immediately.
      ta.focus();
      ta.select();
    },
    showError(message) {
      body.textContent = "";
      const p = document.createElement("p");
      p.textContent = "Error: " + message;
      p.style.cssText = "white-space:pre-wrap;";
      body.appendChild(p);
    },
  };
}

function mkButton(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.style.cssText =
    "padding:8px 12px;font-size:14px;background:#1d9bf0;color:#fff;" +
    "border:0;border-radius:9999px;cursor:pointer;";
  b.addEventListener("click", onClick);
  return b;
}
