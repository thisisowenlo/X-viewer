// iOS Shortcut entry: dual-path extractor.
//
// Path 1 (preferred): when invoked from Safari's share sheet on a logged-in
// x.com tweet detail page, read the rendered DOM directly. Captures focal
// tweet text + replies that have already scrolled into view. No auth needed.
//
// Path 2 (fallback): when invoked from any other source (e.g., the X app's
// share sheet), iOS Shortcuts loads the URL in a fresh, logged-out WebView.
// The DOM is empty (X serves a login wall to guests), so we fall back to
// the public syndication API used by Twitter's embed widgets. Returns the
// focal tweet + parent + a small subset of replies. No auth, no CORS issues,
// no paid API.

(async () => {
  try {
    await new Promise((r) => setTimeout(r, 250));

    const articles = [
      ...document.querySelectorAll('article[data-testid="tweet"]'),
    ];

    if (articles.length > 0) {
      return completion(scrapeFromDOM(articles));
    }

    const focalId = location.pathname.match(/\/status\/(\d+)/)?.[1];
    if (!focalId) {
      completion(
        "ERROR: no tweets in DOM and no /status/<id> in URL.\n" +
          `URL was: ${location.href}\n` +
          "Try opening the tweet in Safari and sharing from there.",
      );
      return;
    }
    completion(await fetchFromSyndication(focalId));
  } catch (e) {
    completion("ERROR: " + (e?.message ?? String(e)));
  }
})();

// --- Path 1: DOM scrape ----------------------------------------------------

function scrapeFromDOM(articles) {
  const focalId = location.pathname.match(/\/status\/(\d+)/)?.[1];
  const focalIdx = focalId
    ? articles.findIndex((a) =>
        [...a.querySelectorAll('a[href*="/status/"]')].some((l) =>
          (l.getAttribute("href") || "").includes("/status/" + focalId),
        ),
      )
    : 0;

  const tweets = articles.map(readArticle).filter((t) => t.text || t.handle);
  if (tweets.length === 0) {
    return "ERROR: found articles but no readable text. X DOM may have changed.";
  }

  const idx = focalIdx >= 0 ? focalIdx : 0;
  const focal = tweets[idx];
  const before = tweets.slice(0, idx);
  const after = tweets.slice(idx + 1);

  return render({
    focal,
    before,
    after,
    sourceUrl: location.href.split("?")[0],
    sourceLabel: "DOM (logged-in Safari)",
  });
}

function readArticle(article) {
  const textEl = article.querySelector('[data-testid="tweetText"]');
  const text = textEl ? textEl.innerText.trim() : "";

  let handle = "";
  const userNameEl = article.querySelector('[data-testid="User-Name"]');
  if (userNameEl) {
    const handleSpan = [...userNameEl.querySelectorAll("span")].find((s) =>
      s.textContent.trim().startsWith("@"),
    );
    if (handleSpan) {
      handle = handleSpan.textContent.trim().replace(/^@/, "");
    } else {
      const link = userNameEl.querySelector('a[href^="/"][role="link"]');
      const m = link?.getAttribute("href")?.match(/^\/([^/]+)/);
      if (m) handle = m[1];
    }
  }

  const time =
    article.querySelector("time[datetime]")?.getAttribute("datetime") || "";
  return { handle, text, time };
}

// --- Path 2: public syndication API fallback ------------------------------

async function fetchFromSyndication(focalId) {
  // Token derivation used by Twitter's embed widgets.
  const token = ((Number(focalId) / 1e15) * Math.PI)
    .toString(36)
    .replace(/(0+|\.)/g, "");
  const url =
    "https://cdn.syndication.twimg.com/tweet-result?" +
    `id=${focalId}&token=${token}&lang=en`;

  let r;
  try {
    r = await fetch(url);
  } catch (e) {
    return `ERROR: syndication fetch network error: ${e.message}`;
  }
  if (!r.ok) {
    return (
      `ERROR: syndication fetch status=${r.status}. ` +
      "Tweet may be deleted, private, age-restricted, or X-only."
    );
  }
  const json = await r.json();

  const author = json.user?.screen_name || "unknown";
  const text = json.text || "";
  const time = json.created_at || "";

  const before = [];
  if (json.parent) {
    before.push({
      handle: json.parent.user?.screen_name || "unknown",
      text: json.parent.text || "",
      time: json.parent.created_at || "",
    });
  }

  const after = [];
  if (Array.isArray(json.conversation)) {
    for (const item of json.conversation) {
      if (!item || item.id_str === focalId) continue;
      after.push({
        handle: item.user?.screen_name || "unknown",
        text: item.text || "",
        time: item.created_at || "",
      });
    }
  }

  return render({
    focal: { handle: author, text, time },
    before,
    after,
    sourceUrl: `https://x.com/${author}/status/${focalId}`,
    sourceLabel:
      "syndication API (limited; for full replies, share from Safari)",
  });
}

// --- shared rendering -----------------------------------------------------

function render({ focal, before, after, sourceUrl, sourceLabel }) {
  const lines = [];
  const firstLine = (focal.text || "").split("\n")[0].slice(0, 80);
  lines.push(`# @${focal.handle || "unknown"}: ${firstLine}`);
  lines.push("");
  lines.push(`> Source: ${sourceUrl}`);
  if (focal.time) lines.push(`> Posted: ${focal.time}`);
  lines.push(`> Captured via: ${sourceLabel}`);
  lines.push("");
  lines.push(focal.text);
  lines.push("");

  if (before.length > 0) {
    lines.push("## In reply to / parent thread");
    lines.push("");
    for (const t of before) {
      lines.push(`### @${t.handle || "unknown"}`);
      lines.push(t.text);
      lines.push("");
    }
  }

  if (after.length > 0) {
    lines.push("## Replies");
    lines.push("");
    for (const t of after) {
      lines.push(`### @${t.handle || "unknown"}`);
      lines.push(t.text);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
